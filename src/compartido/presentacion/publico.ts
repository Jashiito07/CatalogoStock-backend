import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

/**
 * Rutas abiertas (RF-USU-03, contrato de usuarios).
 *
 * Desde la subfase 1.4 todas las rutas exigen un token de acceso válido
 * (guard global de autenticación). Solo las marcadas con `@Publico()` quedan
 * abiertas. Marcar una ruta como pública es una decisión del contrato de API:
 * no se usa para «arreglar» un 401.
 */
const CLAVE_PUBLICO = 'catalogostock:ruta-publica';

/** Marca la ruta (o todo el controlador) como pública: no exige token. */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** `true` si la ruta que se atiende, o su controlador, tiene `@Publico()`. */
export function esRutaPublica(
  reflector: Reflector,
  contexto: ExecutionContext,
): boolean {
  return (
    reflector.getAllAndOverride<boolean | undefined>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]) === true
  );
}
