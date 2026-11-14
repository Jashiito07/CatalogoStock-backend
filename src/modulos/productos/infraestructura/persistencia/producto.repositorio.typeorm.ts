import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, type Repository, type SelectQueryBuilder } from 'typeorm';
import {
  desplazamiento,
  type Pagina,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type {
  FiltroProductos,
  ProductoRepositorio,
} from '../../aplicacion/puertos/producto.repositorio.js';
import type { Producto } from '../../dominio/producto.js';
import { ProductoMapeador } from './producto.mapeador.js';
import { ProductoOrmEntity } from './producto.orm-entity.js';

/** Escapa `\`, `%` y `_` para usar el texto buscado dentro de un `LIKE`. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** Adaptador TypeORM del puerto ProductoRepositorio (tabla `productos`). */
@Injectable()
export class ProductoRepositorioTypeorm implements ProductoRepositorio {
  constructor(
    @Inject(getRepositoryToken(ProductoOrmEntity))
    private readonly repositorio: Repository<ProductoOrmEntity>,
  ) {}

  /** Tabla `productos` en la transacción en curso (UnidadDeTrabajo), si la hay. */
  private get filas(): Repository<ProductoOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async buscarPorId(id: string): Promise<Producto | null> {
    const fila = await this.filas.findOneBy({ id, eliminadoEn: IsNull() });
    return fila ? ProductoMapeador.aDominio(fila) : null;
  }

  async bloquearPorId(id: string): Promise<Producto | null> {
    const fila = await this.filas.findOne({
      where: { id, eliminadoEn: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    return fila ? ProductoMapeador.aDominio(fila) : null;
  }

  async listar(
    filtro: FiltroProductos,
    paginacion: Paginacion,
  ): Promise<Pagina<Producto>> {
    const consulta = this.filas
      .createQueryBuilder('producto')
      .where('producto.eliminadoEn IS NULL');
    this.aplicarFiltro(consulta, filtro);

    const [filas, total] = await consulta
      .orderBy('producto.nombreBusqueda', 'ASC')
      .addOrderBy('producto.id', 'ASC')
      .skip(desplazamiento(paginacion))
      .take(paginacion.tamanio)
      .getManyAndCount();

    return {
      elementos: filas.map((fila) => ProductoMapeador.aDominio(fila)),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total,
    };
  }

  private aplicarFiltro(
    consulta: SelectQueryBuilder<ProductoOrmEntity>,
    filtro: FiltroProductos,
  ): void {
    if (filtro.marcaIds !== undefined) {
      consulta.andWhere('producto.idMarca IN (:...marcaIds)', {
        marcaIds: [...filtro.marcaIds],
      });
    }
    if (filtro.disponibilidad !== undefined) {
      consulta.andWhere('producto.disponibilidad = :disponibilidad', {
        disponibilidad: filtro.disponibilidad,
      });
    }
    if (filtro.clave !== undefined && filtro.clave !== '') {
      consulta.andWhere(
        `(producto.nombreBusqueda LIKE :patron ESCAPE '\\'
          OR producto.descripcionBusqueda LIKE :patron ESCAPE '\\')`,
        { patron: `%${escaparLike(filtro.clave)}%` },
      );
    }
  }

  async crear(producto: Producto): Promise<void> {
    await this.filas.insert(ProductoMapeador.aPersistencia(producto));
  }

  async guardar(producto: Producto): Promise<boolean> {
    const fila = ProductoMapeador.aPersistencia(producto);
    const resultado = await this.filas.update(
      { id: producto.id, eliminadoEn: IsNull() },
      {
        nombre: fila.nombre,
        nombreBusqueda: fila.nombreBusqueda,
        idMarca: fila.idMarca,
        precio: fila.precio,
        descripcion: fila.descripcion,
        descripcionBusqueda: fila.descripcionBusqueda,
        disponibilidad: fila.disponibilidad,
        fechaActualizacion: fila.fechaActualizacion,
      },
    );
    return (resultado.affected ?? 0) > 0;
  }

  async marcarEliminado(id: string, ahora: Date): Promise<boolean> {
    const resultado = await this.filas.update(
      { id, eliminadoEn: IsNull() },
      { eliminadoEn: ahora, fechaActualizacion: ahora },
    );
    return (resultado.affected ?? 0) > 0;
  }
}
