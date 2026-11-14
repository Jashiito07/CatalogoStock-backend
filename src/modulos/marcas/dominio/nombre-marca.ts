import { errorDeCampo } from '../../../compartido/dominio/error-campo.js';

export const LONGITUD_MINIMA_NOMBRE_MARCA = 2;
export const LONGITUD_MAXIMA_NOMBRE_MARCA = 40;

export const MENSAJE_NOMBRE_MARCA_INVALIDO =
  'Ingrese el nombre de la marca (2 a 40 caracteres).';

/**
 * Clave de comparación del nombre: sin tildes, sin mayúsculas y con los
 * espacios repetidos unidos. «Ésika», «esika» y «ESIKA » son la misma marca.
 */
export function claveDeNombreMarca(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Objeto de valor del nombre de la marca (contrato de productos,
 * «Marca»): de 2 a 40 caracteres tras recortar espacios; único sin distinguir
 * mayúsculas ni tildes (`clave`).
 */
export class NombreMarca {
  private constructor(
    readonly valor: string,
    readonly clave: string,
  ) {}

  static crear(entrada: unknown): NombreMarca {
    if (typeof entrada !== 'string') {
      throw errorDeCampo('nombre', MENSAJE_NOMBRE_MARCA_INVALIDO);
    }
    const recortado = entrada.trim().replace(/\s+/g, ' ');
    // Se cuentan puntos de código, no unidades UTF-16.
    const longitud = [...recortado].length;
    if (
      longitud < LONGITUD_MINIMA_NOMBRE_MARCA ||
      longitud > LONGITUD_MAXIMA_NOMBRE_MARCA
    ) {
      throw errorDeCampo('nombre', MENSAJE_NOMBRE_MARCA_INVALIDO);
    }
    return new NombreMarca(recortado, claveDeNombreMarca(recortado));
  }

  toString(): string {
    return this.valor;
  }
}
