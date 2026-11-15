import {
  ConflictoError,
  DemasiadasSolicitudesError,
  ServicioNoDisponibleError,
} from '../../../compartido/dominio/errores.js';

/**
 * Errores de la verificación del correo y de la recuperación por correo
 * (contrato de correo, RF-USU-05, D-50). TypeScript puro.
 */

export const MENSAJE_CORREO_YA_VERIFICADO = 'Tu correo ya está verificado.';
export const MENSAJE_CORREO_NO_DISPONIBLE =
  'El servicio de correo no está disponible. Inténtalo de nuevo en unos minutos.';
export const MENSAJE_DEMASIADAS_SOLICITUDES_CODIGO =
  'Pediste demasiados códigos. Espera un momento e inténtalo de nuevo.';

/** 409 `CORREO_YA_VERIFICADO`: no se envía otro código a un correo ya verificado. */
export class CorreoYaVerificadoError extends ConflictoError {
  constructor() {
    super('CORREO_YA_VERIFICADO', MENSAJE_CORREO_YA_VERIFICADO);
  }
}

/**
 * 503 `CORREO_NO_DISPONIBLE`: el servicio de correo falló. Mensaje genérico:
 * nunca incluye el motivo técnico, el servidor ni las credenciales.
 */
export class CorreoNoDisponibleError extends ServicioNoDisponibleError {
  constructor() {
    super('CORREO_NO_DISPONIBLE', MENSAJE_CORREO_NO_DISPONIBLE);
  }
}

/** 429 `DEMASIADAS_SOLICITUDES`: más de 3 envíos por hora y por cuenta. */
export class DemasiadosEnviosCodigoError extends DemasiadasSolicitudesError {
  constructor(reintentarEnSegundos: number) {
    super('DEMASIADAS_SOLICITUDES', MENSAJE_DEMASIADAS_SOLICITUDES_CODIGO, {
      reintentarEnSegundos,
    });
  }
}
