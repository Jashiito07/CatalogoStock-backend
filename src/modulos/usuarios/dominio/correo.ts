import { errorDeCampo } from './error-campo.js';

/** Longitud máxima de un correo (contrato de usuarios, RFC 5321). */
export const LONGITUD_MAXIMA_CORREO = 254;

export const MENSAJE_CORREO_INVALIDO = 'Ingrese un correo válido.';

/**
 * Formato práctico de correo: parte local y dominio con al menos un punto,
 * sin espacios ni más de una arroba. No intenta cubrir todo el RFC 5322.
 */
const FORMATO_CORREO =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Objeto de valor del correo (contrato de usuarios, «Validaciones»).
 * Se recorta, se guarda en minúsculas y es la clave de unicidad de la cuenta.
 */
export class Correo {
  private constructor(readonly valor: string) {}

  static crear(entrada: unknown): Correo {
    if (typeof entrada !== 'string') {
      throw errorDeCampo('correo', MENSAJE_CORREO_INVALIDO);
    }
    const normalizado = entrada.trim().toLowerCase();
    if (
      normalizado.length === 0 ||
      normalizado.length > LONGITUD_MAXIMA_CORREO ||
      normalizado.includes('..') ||
      !FORMATO_CORREO.test(normalizado)
    ) {
      throw errorDeCampo('correo', MENSAJE_CORREO_INVALIDO);
    }
    return new Correo(normalizado);
  }

  esIgualA(otro: Correo): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor;
  }

  toJSON(): string {
    return this.valor;
  }
}
