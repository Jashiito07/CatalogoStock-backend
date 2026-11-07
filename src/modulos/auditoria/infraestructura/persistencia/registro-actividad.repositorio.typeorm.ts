import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Between,
  type FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  type Repository,
} from 'typeorm';
import {
  desplazamiento,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type {
  RegistroActividadRepositorio,
  ResultadoConsultaBitacora,
} from '../../aplicacion/puertos/registro-actividad.repositorio.js';
import type { FiltrosBitacora } from '../../dominio/filtros-bitacora.js';
import type { RegistroActividad } from '../../dominio/registro-actividad.js';
import { RegistroActividadMapeador } from './registro-actividad.mapeador.js';
import { RegistroActividadOrmEntity } from './registro-actividad.orm-entity.js';

function condicionFecha(
  desde: Date | undefined,
  hasta: Date | undefined,
): FindOptionsWhere<RegistroActividadOrmEntity>['fecha'] {
  if (desde && hasta) {
    return Between(desde, hasta);
  }
  if (desde) {
    return MoreThanOrEqual(desde);
  }
  if (hasta) {
    return LessThanOrEqual(hasta);
  }
  return undefined;
}

/** Adaptador TypeORM del puerto RegistroActividadRepositorio (tabla `auditoria`). */
@Injectable()
export class RegistroActividadRepositorioTypeorm implements RegistroActividadRepositorio {
  constructor(
    @Inject(getRepositoryToken(RegistroActividadOrmEntity))
    private readonly repositorio: Repository<RegistroActividadOrmEntity>,
  ) {}

  /** Usa la transacción en curso (UnidadDeTrabajo) si existe. */
  async guardar(registro: RegistroActividad): Promise<void> {
    await repositorioEnCurso(this.repositorio).insert(
      RegistroActividadMapeador.aPersistencia(registro),
    );
  }

  /**
   * El repositorio inyectado usa su propia conexión del grupo, nunca la de
   * una transacción en curso: un fallo aquí no la aborta.
   */
  async guardarFueraDeTransaccion(registro: RegistroActividad): Promise<void> {
    await this.repositorio.insert(
      RegistroActividadMapeador.aPersistencia(registro),
    );
  }

  async consultar(
    filtros: FiltrosBitacora,
    paginacion: Paginacion,
  ): Promise<ResultadoConsultaBitacora> {
    const donde: FindOptionsWhere<RegistroActividadOrmEntity> = {};
    if (filtros.accion !== undefined) {
      donde.accion = filtros.accion;
    }
    if (filtros.idUsuario !== undefined) {
      donde.idUsuario = filtros.idUsuario;
    }
    if (filtros.entidad !== undefined) {
      donde.entidad = filtros.entidad;
    }
    if (filtros.idEntidad !== undefined) {
      donde.idEntidad = filtros.idEntidad;
    }
    const fecha = condicionFecha(filtros.desde, filtros.hasta);
    if (fecha !== undefined) {
      donde.fecha = fecha;
    }

    const [filas, total] = await this.repositorio.findAndCount({
      where: donde,
      // `id` desempata registros con la misma fecha: el orden es estable entre páginas.
      order: { fecha: 'DESC', id: 'DESC' },
      skip: desplazamiento(paginacion),
      take: paginacion.tamanio,
    });
    return {
      registros: filas.map((fila) => RegistroActividadMapeador.aDominio(fila)),
      total,
    };
  }
}
