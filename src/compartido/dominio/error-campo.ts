import { DatosInvalidosError } from './errores.js';

/**
 * Error de validación de un campo (RNF-03).
 *
 * Usa el mismo formato de `detalles` que el ValidationPipe global
 * (`{ errores: [{ campo, errores }] }`) y **nunca** incluye el valor recibido,
 * porque puede ser un dato personal o una clave.
 */
export function errorDeCampo(
  campo: string,
  mensaje: string,
): DatosInvalidosError {
  return new DatosInvalidosError(mensaje, {
    errores: [{ campo, errores: [mensaje] }],
  });
}
