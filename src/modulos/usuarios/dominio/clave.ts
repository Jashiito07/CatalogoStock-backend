import { errorDeCampo } from './error-campo.js';

export const LONGITUD_MINIMA_CLAVE = 8;
/** Límite impuesto por bcrypt (D-08, contrato de usuarios). */
export const LONGITUD_MAXIMA_CLAVE = 72;

export const MENSAJE_CLAVE_DEBIL =
  'La clave debe tener entre 8 y 72 caracteres, con letras y números.';

/** bcrypt solo usa los primeros 72 bytes de la clave (D-22). */
export const BYTES_MAXIMOS_CLAVE = 72;

const TIENE_LETRA = /\p{L}/u;
const TIENE_NUMERO = /\p{Nd}/u;

/** `TextEncoder` es estándar de JavaScript: el dominio no depende de Node. */
const codificador = new TextEncoder();

/** Bytes que ocupa el texto en UTF-8. */
export function bytesUtf8(texto: string): number {
  return codificador.encode(texto).length;
}

/**
 * Regla de fortaleza de la clave (contrato de usuarios, «Validaciones»):
 * de 8 a 72 caracteres, con al menos una letra y al menos un número, y como
 * máximo 72 bytes en UTF-8 (D-22), para que bcrypt no ignore ningún carácter.
 *
 * La clave no se recorta ni se normaliza: se valida tal como la escribió el
 * usuario. Nunca se incluye en el error (RNF-02).
 */
export function cumpleFortalezaClave(clave: unknown): clave is string {
  if (typeof clave !== 'string') {
    return false;
  }
  const longitud = [...clave].length;
  return (
    longitud >= LONGITUD_MINIMA_CLAVE &&
    longitud <= LONGITUD_MAXIMA_CLAVE &&
    bytesUtf8(clave) <= BYTES_MAXIMOS_CLAVE &&
    TIENE_LETRA.test(clave) &&
    TIENE_NUMERO.test(clave)
  );
}

/** Falla con DATOS_INVALIDOS (campo `clave`) si la clave no cumple la regla. */
export function validarFortalezaClave(clave: unknown): string {
  if (!cumpleFortalezaClave(clave)) {
    throw errorDeCampo('clave', MENSAJE_CLAVE_DEBIL);
  }
  return clave;
}
