import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import {
  DataSource,
  type EntityManager,
  type ObjectLiteral,
  type Repository,
} from 'typeorm';
import type { UnidadDeTrabajo } from '../aplicacion/unidad-trabajo.puerto.js';

/**
 * Transacción en curso del flujo asíncrono actual. Es única para todo el
 * proceso: así los repositorios de **distintos** módulos (por ejemplo
 * `usuarios` y `auditoria`) escriben en la misma transacción sin conocerse.
 */
const transaccionEnCurso = new AsyncLocalStorage<EntityManager>();

/**
 * Repositorio TypeORM que debe usar un adaptador: el de la transacción en
 * curso si existe, o el inyectado (fuera de transacción).
 *
 * @example
 * private get filas() {
 *   return repositorioEnCurso(this.repositorio);
 * }
 */
export function repositorioEnCurso<T extends ObjectLiteral>(
  repositorio: Repository<T>,
): Repository<T> {
  const manejador = transaccionEnCurso.getStore();
  return manejador ? manejador.getRepository(repositorio.target) : repositorio;
}

/** `true` si el flujo actual está dentro de `UnidadDeTrabajoTypeorm.ejecutar`. */
export function hayTransaccionEnCurso(): boolean {
  return transaccionEnCurso.getStore() !== undefined;
}

/** Adaptador TypeORM del puerto UnidadDeTrabajo. */
@Injectable()
export class UnidadDeTrabajoTypeorm implements UnidadDeTrabajo {
  constructor(@Inject(DataSource) private readonly fuente: DataSource) {}

  ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    if (hayTransaccionEnCurso()) {
      return trabajo();
    }
    return this.fuente.transaction((manejador) =>
      transaccionEnCurso.run(manejador, trabajo),
    );
  }
}
