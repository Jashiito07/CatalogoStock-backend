import { NoEncontradoError } from '../../../compartido/dominio/errores.js';
import type { Rol } from './rol.js';

/**
 * Regla de propiedad de los recursos (RF-USU-03, CA-02, CA-19, PA-09).
 * TypeScript puro: la usan los casos de uso de las próximas fases (pedidos,
 * pagos, comprobantes) sin depender de NestJS ni de TypeORM.
 *
 * - El **Cliente** solo accede a los recursos cuyo dueño es él.
 * - El **Vendedor** accede a todos: hay un único Vendedor (PA-09) y CA-19
 *   dice que «el vendedor puede consultar todos». Si en el futuro hubiera
 *   varios vendedores, esta es la única regla que habría que cambiar.
 *
 * Un recurso ajeno se trata igual que uno inexistente: 404 `NO_ENCONTRADO`,
 * para no revelar que existe (contrato de usuarios, «Errores comunes»).
 */

/** Quién hace la solicitud, tomado del token ya verificado. */
export interface ActorAutenticado {
  readonly id: string;
  readonly rol: Rol;
}

export const MENSAJE_RECURSO_NO_ENCONTRADO = 'El recurso solicitado no existe.';

/** `true` si el actor puede acceder a un recurso cuyo dueño es `idDueno`. */
export function puedeAccederARecurso(
  actor: ActorAutenticado,
  idDueno: string,
): boolean {
  if (actor.rol === 'VENDEDOR') {
    return true;
  }
  return actor.id.length > 0 && actor.id === idDueno;
}

/**
 * Devuelve el recurso si existe y el actor puede acceder a él. Si no existe
 * (`null` o `undefined`) o es de otro usuario, falla con el mismo 404
 * `NO_ENCONTRADO`.
 *
 * @example
 * const pedido = exigirAccesoARecurso(actor, await repo.buscarPorId(id), (p) => p.idCliente);
 */
export function exigirAccesoARecurso<T>(
  actor: ActorAutenticado,
  recurso: T | null | undefined,
  dueno: (recurso: T) => string,
  mensaje: string = MENSAJE_RECURSO_NO_ENCONTRADO,
): T {
  if (
    recurso === null ||
    recurso === undefined ||
    !puedeAccederARecurso(actor, dueno(recurso))
  ) {
    throw new NoEncontradoError(mensaje);
  }
  return recurso;
}

/**
 * Alcance de una consulta de listas: el Vendedor ve todo; el Cliente, solo lo
 * suyo. El repositorio lo traduce a `WHERE id_cliente = :idDueno`, para que el
 * filtro se aplique en la base y no después de leer datos ajenos.
 */
export type AlcanceConsulta =
  | { readonly tipo: 'TODOS' }
  | { readonly tipo: 'DEL_DUENO'; readonly idDueno: string };

export function alcanceDeConsulta(actor: ActorAutenticado): AlcanceConsulta {
  return actor.rol === 'VENDEDOR'
    ? { tipo: 'TODOS' }
    : { tipo: 'DEL_DUENO', idDueno: actor.id };
}
