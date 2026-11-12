import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { restriccionUnicaVioladaEn } from '../../../../compartido/infraestructura/errores-base-datos.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type { MarcaRepositorio } from '../../aplicacion/puertos/marca.repositorio.js';
import { MarcaDuplicadaError } from '../../dominio/errores-marca.js';
import type { Marca } from '../../dominio/marca.js';
import { MarcaMapeador } from './marca.mapeador.js';
import { MarcaOrmEntity } from './marca.orm-entity.js';

/** Índice único del nombre normalizado (ver la migración CrearTablaMarcas). */
const RESTRICCION_NOMBRE_UNICO = 'uq_marcas_nombre_busqueda';

/** Adaptador TypeORM del puerto MarcaRepositorio (tabla `marcas`). */
@Injectable()
export class MarcaRepositorioTypeorm implements MarcaRepositorio {
  constructor(
    @Inject(getRepositoryToken(MarcaOrmEntity))
    private readonly repositorio: Repository<MarcaOrmEntity>,
  ) {}

  /** Tabla `marcas` en la transacción en curso (UnidadDeTrabajo), si la hay. */
  private get filas(): Repository<MarcaOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async buscarPorId(id: string): Promise<Marca | null> {
    const fila = await this.filas.findOneBy({ id });
    return fila ? MarcaMapeador.aDominio(fila) : null;
  }

  async buscarPorClaveNombre(clave: string): Promise<Marca | null> {
    const fila = await this.filas.findOneBy({ nombreBusqueda: clave });
    return fila ? MarcaMapeador.aDominio(fila) : null;
  }

  async buscarPorIds(ids: readonly string[]): Promise<Marca[]> {
    if (ids.length === 0) {
      return [];
    }
    const filas = await this.filas.findBy({ id: In([...ids]) });
    return filas.map((fila) => MarcaMapeador.aDominio(fila));
  }

  async listar(incluirInactivas: boolean): Promise<Marca[]> {
    const filas = await this.filas.find({
      where: incluirInactivas ? {} : { activa: true },
      order: { orden: 'ASC', nombreBusqueda: 'ASC', id: 'ASC' },
    });
    return filas.map((fila) => MarcaMapeador.aDominio(fila));
  }

  async siguienteOrden(): Promise<number> {
    const resultado = await this.filas
      .createQueryBuilder('marca')
      .select('MAX(marca.orden)', 'maximo')
      .getRawOne<{ maximo: number | string | null }>();
    const maximo = resultado?.maximo;
    return maximo === null || maximo === undefined ? 0 : Number(maximo) + 1;
  }

  async crear(marca: Marca): Promise<void> {
    try {
      await this.filas.insert(MarcaMapeador.aPersistencia(marca));
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async guardar(marca: Marca): Promise<void> {
    const fila = MarcaMapeador.aPersistencia(marca);
    try {
      await this.filas.update(
        { id: marca.id },
        {
          nombre: fila.nombre,
          nombreBusqueda: fila.nombreBusqueda,
          color: fila.color,
          colorAcento: fila.colorAcento,
          activa: fila.activa,
          orden: fila.orden,
          fechaActualizacion: fila.fechaActualizacion,
        },
      );
    } catch (error) {
      throw this.traducir(error);
    }
  }

  private traducir(error: unknown): unknown {
    return restriccionUnicaVioladaEn(error) === RESTRICCION_NOMBRE_UNICO
      ? new MarcaDuplicadaError()
      : error;
  }
}
