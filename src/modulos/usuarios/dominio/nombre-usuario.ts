import { errorDeCampo } from './error-campo.js';

export const LONGITUD_MINIMA_NOMBRE = 2;
export const LONGITUD_MAXIMA_NOMBRE = 100;

export const MENSAJE_NOMBRE_INVALIDO =
  'Ingrese su nombre (2 a 100 caracteres).';

/**
 * Objeto de valor del nombre (contrato de usuarios, «Validaciones»):
 * obligatorio, de 2 a 100 caracteres tras recortar los espacios del inicio y del final.
 */
export class NombreUsuario {
  private constructor(readonly valor: string) {}

  static crear(entrada: unknown): NombreUsuario {
    if (typeof entrada !== 'string') {
      throw errorDeCampo('nombre', MENSAJE_NOMBRE_INVALIDO);
    }
    const recortado = entrada.trim();
    // Se cuentan puntos de código, no unidades UTF-16 (tildes, eñes, emojis).
    const longitud = [...recortado].length;
    if (
      longitud < LONGITUD_MINIMA_NOMBRE ||
      longitud > LONGITUD_MAXIMA_NOMBRE
    ) {
      throw errorDeCampo('nombre', MENSAJE_NOMBRE_INVALIDO);
    }
    return new NombreUsuario(recortado);
  }

  toString(): string {
    return this.valor;
  }

  toJSON(): string {
    return this.valor;
  }
}
