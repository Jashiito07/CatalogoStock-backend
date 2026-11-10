import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  type EntityManager,
  In,
  IsNull,
  LessThan,
  MoreThan,
  type Repository,
} from 'typeorm';
import {
  hayTransaccionEnCurso,
  repositorioEnCurso,
} from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type { CodigoRecuperacionRepositorio } from '../../aplicacion/puertos/codigo-recuperacion.repositorio.js';
import {
  type CodigoRecuperacion,
  INTENTOS_MAXIMOS_CODIGO,
} from '../../dominio/codigo-recuperacion.js';
import { CodigoRecuperacionMapeador } from './codigo-recuperacion.mapeador.js';
import { CodigoRecuperacionOrmEntity } from './codigo-recuperacion.orm-entity.js';

/** Adaptador TypeORM del puerto CodigoRecuperacionRepositorio (tabla `codigos_recuperacion`). */
@Injectable()
export class CodigoRecuperacionRepositorioTypeorm implements CodigoRecuperacionRepositorio {
  constructor(
    @Inject(getRepositoryToken(CodigoRecuperacionOrmEntity))
    private readonly repositorio: Repository<CodigoRecuperacionOrmEntity>,
  ) {}

  /** Tabla en la transacción en curso (UnidadDeTrabajo), si la hay. */
  private get filas(): Repository<CodigoRecuperacionOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  /** Ejecuta en la transacción en curso o, si no hay ninguna, en una propia. */
  private enTransaccion<T>(
    trabajo: (manejador: EntityManager) => Promise<T>,
  ): Promise<T> {
    return hayTransaccionEnCurso()
      ? trabajo(this.filas.manager)
      : this.repositorio.manager.transaction(trabajo);
  }

  /**
   * Bloquea la fila del Cliente en `usuarios` (`FOR UPDATE`) para que dos
   * generaciones simultáneas no choquen con el índice único parcial: la
   * segunda espera, invalida el código de la primera y guarda el suyo.
   */
  reemplazarPendientes(nuevo: CodigoRecuperacion, ahora: Date): Promise<void> {
    return this.enTransaccion(async (manejador) => {
      await manejador.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [
        nuevo.idUsuario,
      ]);
      await manejador.update(
        CodigoRecuperacionOrmEntity,
        {
          idUsuario: nuevo.idUsuario,
          fechaUso: IsNull(),
          fechaInvalidacion: IsNull(),
        },
        { fechaInvalidacion: ahora },
      );
      await manejador.insert(
        CodigoRecuperacionOrmEntity,
        CodigoRecuperacionMapeador.aPersistencia(nuevo),
      );
    });
  }

  /** `pessimistic_write` exige una transacción: TypeORM falla si no la hay. */
  async buscarUltimoParaActualizar(
    idUsuario: string,
  ): Promise<CodigoRecuperacion | null> {
    const fila = await this.filas.findOne({
      where: { idUsuario },
      // `id` desempata dos códigos creados en el mismo instante.
      order: { fechaCreacion: 'DESC', id: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    return fila ? CodigoRecuperacionMapeador.aDominio(fila) : null;
  }

  async guardar(codigo: CodigoRecuperacion): Promise<void> {
    await this.filas.update(
      { id: codigo.id },
      {
        fechaUso: codigo.usadoEn,
        fechaInvalidacion: codigo.invalidadoEn,
        intentosFallidos: codigo.intentosFallidos,
      },
    );
  }

  async vencimientosVigentes(
    idsUsuarios: readonly string[],
    ahora: Date,
  ): Promise<ReadonlyMap<string, Date>> {
    if (idsUsuarios.length === 0) {
      return new Map();
    }
    const filas = await this.filas.find({
      select: { idUsuario: true, fechaVencimiento: true },
      where: {
        idUsuario: In([...idsUsuarios]),
        fechaUso: IsNull(),
        fechaInvalidacion: IsNull(),
        fechaVencimiento: MoreThan(ahora),
        intentosFallidos: LessThan(INTENTOS_MAXIMOS_CODIGO),
      },
    });
    return new Map(
      filas.map((fila) => [fila.idUsuario, fila.fechaVencimiento]),
    );
  }
}
