import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { Response } from 'express';
import type { RespuestaError } from './respuesta-error.js';

/**
 * Límite de intentos por dirección IP (D-17, contrato de usuarios).
 *
 * Cada grupo tiene su propio contador. Las rutas de un mismo grupo **suman**
 * sus intentos: `/ingreso/cliente` e `/ingreso/vendedor` comparten el grupo
 * `INGRESO` (5 por minuto entre las dos). Las rutas sin `@LimiteIntentos`
 * no tienen límite.
 */
export const GRUPOS_LIMITE_INTENTOS = {
  INGRESO: { limite: 5, ventanaMs: 60_000 },
  REGISTRO: { limite: 3, ventanaMs: 60_000 },
  RENOVACION: { limite: 10, ventanaMs: 60_000 },
} as const;

export type GrupoLimiteIntentos = keyof typeof GRUPOS_LIMITE_INTENTOS;

export const CODIGO_DEMASIADAS_SOLICITUDES = 'DEMASIADAS_SOLICITUDES';
export const MENSAJE_DEMASIADAS_SOLICITUDES =
  'Demasiados intentos. Espere un momento e inténtelo de nuevo.';

const CLAVE_GRUPO = 'catalogostock:grupo-limite-intentos';
const reflector = new Reflector();

/** Asigna la ruta (o el controlador) a un grupo de límite de intentos. */
export const LimiteIntentos = (grupo: GrupoLimiteIntentos) =>
  SetMetadata(CLAVE_GRUPO, grupo);

/** Grupo de la ruta que se está atendiendo, o `undefined` si no tiene límite. */
export function grupoDeLaRuta(
  contexto: ExecutionContext,
): GrupoLimiteIntentos | undefined {
  return reflector.getAllAndOverride<GrupoLimiteIntentos | undefined>(
    CLAVE_GRUPO,
    [contexto.getHandler(), contexto.getClass()],
  );
}

/**
 * Opciones de `ThrottlerModule`: un limitador por grupo.
 * - `skipIf`: cada limitador solo cuenta las rutas de su grupo.
 * - `generateKey`: la clave es grupo + IP (no la ruta), así las rutas de un
 *   grupo comparten el contador.
 * - `setHeaders: false`: `Retry-After` lo pone `GuardLimiteIntentos` con el
 *   nombre exacto del contrato.
 */
export function crearOpcionesLimiteIntentos(): ThrottlerModuleOptions {
  return {
    setHeaders: false,
    throttlers: Object.entries(GRUPOS_LIMITE_INTENTOS).map(
      ([grupo, { limite, ventanaMs }]) => ({
        name: grupo,
        limit: limite,
        ttl: ventanaMs,
        skipIf: (contexto: ExecutionContext) =>
          grupoDeLaRuta(contexto) !== grupo,
        generateKey: (_contexto: ExecutionContext, ip: string) =>
          `${grupo}:${ip}`,
      }),
    ),
  };
}

/** Cuerpo de la respuesta 429 del contrato. */
export function respuestaDemasiadasSolicitudes(
  reintentarEnSegundos: number,
): RespuestaError {
  return {
    codigo: CODIGO_DEMASIADAS_SOLICITUDES,
    mensaje: MENSAJE_DEMASIADAS_SOLICITUDES,
    detalles: { reintentarEnSegundos },
  };
}

/**
 * Guard global del límite de intentos. Al superarlo responde 429
 * `DEMASIADAS_SOLICITUDES` con la cabecera `Retry-After` y
 * `detalles.reintentarEnSegundos` (contrato de usuarios, D-17).
 * No registra la IP ni el cuerpo de la solicitud.
 */
@Injectable()
export class GuardLimiteIntentos extends ThrottlerGuard {
  protected override throwThrottlingException(
    contexto: ExecutionContext,
    detalle: ThrottlerLimitDetail,
  ): Promise<void> {
    const segundos = Math.max(1, Math.ceil(detalle.timeToBlockExpire));
    contexto
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(segundos));
    return Promise.reject(
      new HttpException(
        respuestaDemasiadasSolicitudes(segundos),
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
  }
}
