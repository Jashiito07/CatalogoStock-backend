import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, type Repository, type SelectQueryBuilder } from 'typeorm';
import {
  desplazamiento,
  type Pagina,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { restriccionUnicaVioladaEn } from '../../../../compartido/infraestructura/errores-base-datos.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type {
  FiltroProductos,
  ProductoRepositorio,
} from '../../aplicacion/puertos/producto.repositorio.js';
import { CodigoDuplicadoError } from '../../dominio/errores-producto.js';
import type { Producto } from '../../dominio/producto.js';
import { ProductoMapeador } from './producto.mapeador.js';
import { ProductoOrmEntity } from './producto.orm-entity.js';

/** Escapa `\`, `%` y `_` para usar el texto buscado dentro de un `LIKE`. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

const RESTRICCION_CODIGO = 'uq_productos_marca_codigo';

/** Convierte la violación del índice único (marca, código) en `CODIGO_DUPLICADO` (409); deja pasar el resto. */
function traducirCodigoDuplicado(error: unknown): unknown {
  return restriccionUnicaVioladaEn(error) === RESTRICCION_CODIGO
    ? new CodigoDuplicadoError()
    : error;
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
          OR producto.descripcionBusqueda LIKE :patron ESCAPE '\\'
          OR lower(producto.codigo) LIKE :patron ESCAPE '\\')`,
        { patron: `%${escaparLike(filtro.clave)}%` },
      );
    }
  }

  async crear(producto: Producto): Promise<void> {
    try {
      await this.filas.insert(ProductoMapeador.aPersistencia(producto));
    } catch (error) {
      throw traducirCodigoDuplicado(error);
    }
  }

  async guardar(producto: Producto): Promise<boolean> {
    const fila = ProductoMapeador.aPersistencia(producto);
    try {
      const resultado = await this.filas.update(
        { id: producto.id, eliminadoEn: IsNull() },
        {
          nombre: fila.nombre,
          nombreBusqueda: fila.nombreBusqueda,
          codigo: fila.codigo,
          idMarca: fila.idMarca,
          precio: fila.precio,
          descripcion: fila.descripcion,
          descripcionBusqueda: fila.descripcionBusqueda,
          disponibilidad: fila.disponibilidad,
          fechaActualizacion: fila.fechaActualizacion,
        },
      );
      return (resultado.affected ?? 0) > 0;
    } catch (error) {
      throw traducirCodigoDuplicado(error);
    }
  }

  async buscarPorCodigos(
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Producto[]> {
    if (codigos.length === 0) {
      return [];
    }
    const filas = await this.filas
      .createQueryBuilder('producto')
      .where('producto.eliminadoEn IS NULL')
      .andWhere('producto.idMarca = :marcaId', { marcaId })
      .andWhere('producto.codigo = ANY(CAST(:codigos AS varchar[]))', {
        codigos: [...codigos],
      })
      .getMany();
    return filas.map((fila) => ProductoMapeador.aDominio(fila));
  }

  async codigosExistentes(
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Set<string>> {
    if (codigos.length === 0) {
      return new Set();
    }
    const filas = await this.filas
      .createQueryBuilder('producto')
      .select('producto.codigo', 'codigo')
      .where('producto.eliminadoEn IS NULL')
      .andWhere('producto.idMarca = :marcaId', { marcaId })
      .andWhere('producto.codigo = ANY(CAST(:codigos AS varchar[]))', {
        codigos: [...codigos],
      })
      .getRawMany<{ codigo: string }>();
    return new Set(filas.map((fila) => fila.codigo));
  }

  async bloquearPorCodigo(
    marcaId: string,
    codigo: string,
  ): Promise<Producto | null> {
    const fila = await this.filas.findOne({
      where: { idMarca: marcaId, codigo, eliminadoEn: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    return fila ? ProductoMapeador.aDominio(fila) : null;
  }

  /** Misma regla que `claveDeEmparejamiento`, en SQL sobre `nombre_busqueda` (ya sin tildes y en minúsculas). */
  private static readonly CLAVE_SQL =
    `trim(both ' ' from regexp_replace(producto.nombreBusqueda, '[^a-z0-9]+', ' ', 'g'))`;

  async buscarSinCodigoPorClaves(
    marcaId: string,
    claves: readonly string[],
  ): Promise<Producto[]> {
    if (claves.length === 0) {
      return [];
    }
    const filas = await this.filas
      .createQueryBuilder('producto')
      .where('producto.eliminadoEn IS NULL')
      .andWhere('producto.codigo IS NULL')
      .andWhere('producto.idMarca = :marcaId', { marcaId })
      .andWhere(
        `${ProductoRepositorioTypeorm.CLAVE_SQL} = ANY(CAST(:claves AS varchar[]))`,
        { claves: [...claves] },
      )
      .getMany();
    return filas.map((fila) => ProductoMapeador.aDominio(fila));
  }

  async bloquearSinCodigoPorClave(
    marcaId: string,
    clave: string,
  ): Promise<Producto[]> {
    // Serializa a quienes aprueban el mismo nombre a la vez: sin esto, dos
    // aprobaciones crearían dos productos al no haber fila que bloquear.
    await this.filas.manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`productos_nombre:${marcaId}:${clave}`],
    );
    const filas = await this.filas
      .createQueryBuilder('producto')
      .setLock('pessimistic_write')
      .where('producto.eliminadoEn IS NULL')
      .andWhere('producto.codigo IS NULL')
      .andWhere('producto.idMarca = :marcaId', { marcaId })
      .andWhere(`${ProductoRepositorioTypeorm.CLAVE_SQL} = :clave`, { clave })
      .getMany();
    return filas.map((fila) => ProductoMapeador.aDominio(fila));
  }

  async listarAusentes(
    marcaId: string,
    codigosPresentes: readonly string[],
    paginacion: Paginacion,
  ): Promise<Pagina<Producto>> {
    const [filas, total] = await this.filas
      .createQueryBuilder('producto')
      .where('producto.eliminadoEn IS NULL')
      .andWhere('producto.idMarca = :marcaId', { marcaId })
      .andWhere('producto.codigo IS NOT NULL')
      .andWhere('NOT (producto.codigo = ANY(CAST(:codigos AS varchar[])))', {
        codigos: [...codigosPresentes],
      })
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

  async marcarEliminado(id: string, ahora: Date): Promise<boolean> {
    const resultado = await this.filas.update(
      { id, eliminadoEn: IsNull() },
      { eliminadoEn: ahora, fechaActualizacion: ahora },
    );
    return (resultado.affected ?? 0) > 0;
  }
}
