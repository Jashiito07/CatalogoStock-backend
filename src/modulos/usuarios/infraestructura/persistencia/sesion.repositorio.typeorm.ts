import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
import type { SesionRepositorio } from '../../aplicacion/puertos/sesion.repositorio.js';
import type { MotivoRevocacion, Sesion } from '../../dominio/sesion.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import { SesionMapeador } from './sesion.mapeador.js';
import { SesionOrmEntity } from './sesion.orm-entity.js';

/** Adaptador TypeORM del puerto SesionRepositorio (tabla `sesiones`). */
@Injectable()
export class SesionRepositorioTypeorm implements SesionRepositorio {
  constructor(
    @Inject(getRepositoryToken(SesionOrmEntity))
    private readonly repositorio: Repository<SesionOrmEntity>,
  ) {}

  /** Tabla `sesiones` en la transacción en curso (UnidadDeTrabajo), si la hay. */
  private get filas(): Repository<SesionOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async crear(sesion: Sesion): Promise<void> {
    await this.filas.insert(SesionMapeador.aPersistencia(sesion));
  }

  async buscarPorHashToken(hashToken: string): Promise<Sesion | null> {
    const fila = await this.filas.findOneBy({ hashToken });
    return fila ? SesionMapeador.aDominio(fila) : null;
  }

  /**
   * D-09: el `UPDATE … WHERE fecha_revocacion IS NULL` es la condición
   * atómica. Si dos solicitudes rotan el mismo token a la vez, PostgreSQL
   * solo deja que una lo actualice; la otra recibe 0 filas y no inserta nada.
   */
  guardarRotacion(anterior: Sesion, siguiente: Sesion): Promise<boolean> {
    return this.repositorio.manager.transaction(async (manager) => {
      const resultado = await manager.update(
        SesionOrmEntity,
        { id: anterior.id, fechaRevocacion: IsNull() },
        {
          fechaRevocacion: anterior.revocadaEn,
          motivoRevocacion: anterior.motivoRevocacion,
        },
      );
      if (resultado.affected !== 1) {
        return false;
      }
      await manager.insert(
        SesionOrmEntity,
        SesionMapeador.aPersistencia(siguiente),
      );
      return true;
    });
  }

  async revocarFamilia(
    familia: string,
    motivo: Exclude<MotivoRevocacion, 'ROTADA'>,
    ahora: Date,
  ): Promise<number> {
    const resultado = await this.filas.update(
      { familia, fechaRevocacion: IsNull() },
      { fechaRevocacion: ahora, motivoRevocacion: motivo },
    );
    return resultado.affected ?? 0;
  }
}
