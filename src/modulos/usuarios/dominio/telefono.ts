import { errorDeCampo } from './error-campo.js';

export const MENSAJE_TELEFONO_INVALIDO =
  'Ingrese un celular de Ecuador válido, por ejemplo 0991234567.';

/** Celular nacional: `09` seguido de 8 dígitos (10 dígitos en total). */
const FORMATO_NACIONAL = /^09(\d{8})$/;

/** Celular internacional E.164 de Ecuador: `+5939` seguido de 8 dígitos. */
const FORMATO_E164 = /^\+5939(\d{8})$/;

/** Separadores que se ignoran al leer el número. */
const SEPARADORES = /[\s-]/g;

/**
 * Objeto de valor del teléfono (D-14): solo celulares de Ecuador.
 *
 * Acepta `09XXXXXXXX` o `+5939XXXXXXXX`, ignorando espacios y guiones, y se
 * guarda siempre en formato E.164 `+5939XXXXXXXX`, listo para WhatsApp
 * (RF-WAP-03). Rechaza teléfonos fijos y números de otros países.
 */
export class Telefono {
  private constructor(readonly valor: string) {}

  static crear(entrada: unknown): Telefono {
    if (typeof entrada !== 'string') {
      throw errorDeCampo('telefono', MENSAJE_TELEFONO_INVALIDO);
    }
    const limpio = entrada.replace(SEPARADORES, '');
    const nacional = FORMATO_NACIONAL.exec(limpio);
    if (nacional) {
      return new Telefono(`+5939${nacional[1]}`);
    }
    const internacional = FORMATO_E164.exec(limpio);
    if (internacional) {
      return new Telefono(`+5939${internacional[1]}`);
    }
    throw errorDeCampo('telefono', MENSAJE_TELEFONO_INVALIDO);
  }

  esIgualA(otro: Telefono): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor;
  }

  toJSON(): string {
    return this.valor;
  }
}
