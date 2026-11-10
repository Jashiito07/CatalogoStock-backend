import {
  NoEncontradoError,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';
import { cumpleFortalezaClave, MENSAJE_CLAVE_DEBIL } from './clave.js';
import { errorDeCampo } from './error-campo.js';

/**
 * Reglas y errores del cambio y la recuperación de clave (RF-USU-05, D-35,
 * D-39; contrato de recuperación de clave). TypeScript puro.
 */

export const MENSAJE_CLAVE_NUEVA_IGUAL =
  'La clave nueva debe ser distinta de la actual.';
export const MENSAJE_CLAVE_ACTUAL_INCORRECTA =
  'La clave actual no es correcta.';
export const MENSAJE_CLIENTE_NO_ENCONTRADO =
  'No existe un cliente con ese identificador.';
export const MENSAJE_CUENTA_INACTIVA = 'La cuenta del cliente está inactiva.';
export const MENSAJE_VENDEDOR_NO_EXISTE =
  'No existe un Vendedor. Créelo primero con npm run crear-vendedor.';

/** Origen de un `CLAVE_RESTABLECIDA` (contrato de auditoría). */
export type OrigenRestablecimiento = 'CODIGO_VENDEDOR' | 'COMANDO_SERVIDOR';

/**
 * Valida la clave nueva con las reglas de la clave (8 a 72 caracteres y como
 * máximo 72 bytes, con letras y números; D-22). El error nombra el campo
 * indicado y nunca incluye la clave.
 */
export function validarClaveNueva(
  clave: unknown,
  campo = 'claveNueva',
): string {
  if (!cumpleFortalezaClave(clave)) {
    throw errorDeCampo(campo, MENSAJE_CLAVE_DEBIL);
  }
  return clave;
}

/** 400 `DATOS_INVALIDOS` si la clave nueva es igual a la actual. */
export function exigirClaveNuevaDistinta(
  claveActual: string,
  claveNueva: string,
): void {
  if (claveActual === claveNueva) {
    throw errorDeCampo('claveNueva', MENSAJE_CLAVE_NUEVA_IGUAL);
  }
}

/** 422 `CLAVE_ACTUAL_INCORRECTA` (cambio de clave con sesión). */
export class ClaveActualIncorrectaError extends ReglaNegocioError {
  constructor() {
    super('CLAVE_ACTUAL_INCORRECTA', MENSAJE_CLAVE_ACTUAL_INCORRECTA);
  }
}

/**
 * 404 `NO_ENCONTRADO`: no existe un **Cliente** con ese id. También para el id
 * del Vendedor (D-35: el Vendedor usa el comando del servidor).
 */
export class ClienteNoEncontradoError extends NoEncontradoError {
  constructor() {
    super(MENSAJE_CLIENTE_NO_ENCONTRADO);
  }
}

/** 422 `CUENTA_INACTIVA`: no se genera un código para un Cliente inactivo. */
export class CuentaInactivaError extends ReglaNegocioError {
  constructor() {
    super('CUENTA_INACTIVA', MENSAJE_CUENTA_INACTIVA);
  }
}

/** El comando `restablecer-clave-vendedor` no encontró al Vendedor. */
export class VendedorNoExisteError extends NoEncontradoError {
  constructor() {
    super(MENSAJE_VENDEDOR_NO_EXISTE);
  }
}
