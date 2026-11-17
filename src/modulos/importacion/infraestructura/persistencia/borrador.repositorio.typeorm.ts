import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository, SelectQueryBuilder } from 'typeorm';
import {
  desplazamiento,
  type Pagina,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type {
  BorradorRepositorio,
  FiltroBorradores,
} from '../../aplicacion/puertos/borrador.repositorio.js';
import type { Borrador } from '../../dominio/borrador.js';
import type { TotalesImportacion } from '../../dominio/importacion.js';
import { BorradorMapeador } from './borrador.mapeador.js';
import { BorradorOrmEntity } from './borrador.orm-entity.js';

/** Escapa `\`, `%` y `_` para usar el texto buscado dentro de un `LIKE`. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/**
 * «Con advertencias»: alguna distinta de las informativas (`PRECIO_EN_OFERTA`,
 * `VARIAS_REFERENCIAS`). Se compara con una lista fija y propia, nunca con
 * texto del usuario. Debe reflejar ADVERTENCIAS_INFORMATIVAS del dominio.
 */
const CON_REVISION = `cardinality(array_remove(array_remove(borrador.advertencias, 'PRECIO_EN_OFERTA'), 'VARIAS_REFERENCIAS')) > 0`;

/** Adaptador TypeORM del puerto BorradorRepositorio (tabla `borradores_producto`). */
@Injectable()
export class BorradorRepositorioTypeorm implements BorradorRepositorio {
  constructor(
    @Inject(getRepositoryToken(BorradorOrmEntity))
    private readonly repositorio: Repository<BorradorOrmEntity>,
  ) {}

  private get filas(): Repository<BorradorOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async insertarVarios(borradores: readonly Borrador[]): Promise<void> {
    if (borradores.length === 0) {
      return;
    }
    await this.filas.insert(borradores.map(BorradorMapeador.aPersistencia));
  }

  async buscarPorId(id: string): Promise<Borrador | null> {
    const fila = await this.filas.findOneBy({ id });
    return fila ? BorradorMapeador.aDominio(fila) : null;
  }

  async bloquearPorId(id: string): Promise<Borrador | null> {
    const fila = await this.filas.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return fila ? BorradorMapeador.aDominio(fila) : null;
  }

  async guardar(borrador: Borrador): Promise<boolean> {
    const fila = BorradorMapeador.aPersistencia(borrador);
    const resultado = await this.filas.update(
      { id: borrador.id },
      {
        nombre: fila.nombre,
        nombreBusqueda: fila.nombreBusqueda,
        descripcion: fila.descripcion,
        precio: fila.precio,
        idMarca: fila.idMarca,
        disponibilidad: fila.disponibilidad,
        estado: fila.estado,
        advertencias: fila.advertencias,
        idProducto: fila.idProducto,
        fechaActualizacion: fila.fechaActualizacion,
      },
    );
    return (resultado.affected ?? 0) > 0;
  }

  async listar(
    filtro: FiltroBorradores,
    paginacion: Paginacion,
  ): Promise<Pagina<Borrador>> {
    const consulta = this.filas
      .createQueryBuilder('borrador')
      .where('borrador.idImportacion = :idImportacion', {
        idImportacion: filtro.idImportacion,
      })
      .andWhere('borrador.estado = :estado', { estado: filtro.estado });
    this.aplicarFiltro(consulta, filtro);

    const [filas, total] = await consulta
      .orderBy('borrador.pagina', 'ASC')
      .addOrderBy('borrador.posicion', 'ASC')
      .addOrderBy('borrador.id', 'ASC')
      .skip(desplazamiento(paginacion))
      .take(paginacion.tamanio)
      .getManyAndCount();

    return {
      elementos: filas.map((fila) => BorradorMapeador.aDominio(fila)),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total,
    };
  }

  private aplicarFiltro(
    consulta: SelectQueryBuilder<BorradorOrmEntity>,
    filtro: FiltroBorradores,
  ): void {
    if (filtro.conAdvertencias === true) {
      consulta.andWhere(CON_REVISION);
    } else if (filtro.conAdvertencias === false) {
      consulta.andWhere(`NOT (${CON_REVISION})`);
    }
    if (filtro.paginaPdf !== undefined) {
      consulta.andWhere('borrador.pagina = :paginaPdf', {
        paginaPdf: filtro.paginaPdf,
      });
    }
    if (filtro.clave !== undefined && filtro.clave !== '') {
      consulta.andWhere(
        `(borrador.nombreBusqueda LIKE :patron ESCAPE '\\'
          OR lower(borrador.codigo) LIKE :patron ESCAPE '\\')`,
        { patron: `%${escaparLike(filtro.clave)}%` },
      );
    }
  }

  async totales(idImportacion: string): Promise<TotalesImportacion> {
    const filas = await this.filas
      .createQueryBuilder('borrador')
      .select('borrador.estado', 'estado')
      .addSelect('count(*)', 'cantidad')
      .addSelect(`count(*) FILTER (WHERE ${CON_REVISION})`, 'conRevision')
      .where('borrador.idImportacion = :idImportacion', { idImportacion })
      .groupBy('borrador.estado')
      .getRawMany<{ estado: string; cantidad: string; conRevision: string }>();
    const totales: TotalesImportacion = {
      pendientes: 0,
      aprobados: 0,
      descartados: 0,
      conAdvertencias: 0,
    };
    for (const fila of filas) {
      const cantidad = Number(fila.cantidad);
      if (fila.estado === 'PENDIENTE') {
        totales.pendientes = cantidad;
        totales.conAdvertencias = Number(fila.conRevision);
      } else if (fila.estado === 'APROBADO') {
        totales.aprobados = cantidad;
      } else if (fila.estado === 'DESCARTADO') {
        totales.descartados = cantidad;
      }
    }
    return totales;
  }

  async codigosAprobados(codigos: readonly string[]): Promise<Set<string>> {
    if (codigos.length === 0) {
      return new Set();
    }
    const filas = await this.filas
      .createQueryBuilder('borrador')
      .select('DISTINCT borrador.codigo', 'codigo')
      .where('borrador.estado = :estado', { estado: 'APROBADO' })
      .andWhere('borrador.codigo IN (:...codigos)', { codigos: [...codigos] })
      .getRawMany<{ codigo: string }>();
    return new Set(filas.map((fila) => fila.codigo));
  }
}
