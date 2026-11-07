import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import type { SolicitudAutenticada } from './guard-token-acceso.js';

/**
 * Identidad verificada por el guard global: `{ id, rol }`. Si falta (la ruta
 * es `@Publico()` o el guard no se ejecutó), nunca se trata como anónima:
 * 401 `NO_AUTENTICADO`.
 */
export function extraerUsuarioActual(
  contexto: ExecutionContext,
): ActorAutenticado {
  const actor = contexto
    .switchToHttp()
    .getRequest<SolicitudAutenticada>().usuarioActual;
  if (!actor) {
    throw new TokenAccesoAusenteError();
  }
  return actor;
}

/**
 * Parámetro con el usuario autenticado (RF-USU-03).
 *
 * @example
 * consultar(@UsuarioActual() actor: ActorAutenticado) { … }
 */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): ActorAutenticado =>
    extraerUsuarioActual(contexto),
);
