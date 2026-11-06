import {
  PrivacidadDesactualizadaError,
  PrivacidadNoAceptadaError,
} from './errores-autenticacion.js';

/** Aviso de privacidad vigente (RNF-16, D-11, D-15). */
export interface AvisoPrivacidad {
  /** Cambia cada vez que cambia el texto; el registro debe aceptar la vigente. */
  version: string;
  titulo: string;
  /** Texto en Markdown. */
  contenido: string;
  vigenteDesde: Date;
}

/**
 * Regla de aceptación del aviso al registrarse (RNF-16, PA-12, D-11):
 * 1. `aceptaPrivacidad` debe ser `true` → si no, `PRIVACIDAD_NO_ACEPTADA`.
 * 2. La versión aceptada debe ser la vigente → si no, `PRIVACIDAD_DESACTUALIZADA`
 *    con `detalles.versionVigente`.
 */
export function verificarAceptacionPrivacidad(
  aceptaPrivacidad: boolean,
  versionAceptada: string,
  vigente: AvisoPrivacidad,
): void {
  if (aceptaPrivacidad !== true) {
    throw new PrivacidadNoAceptadaError();
  }
  if (versionAceptada !== vigente.version) {
    throw new PrivacidadDesactualizadaError(vigente.version);
  }
}
