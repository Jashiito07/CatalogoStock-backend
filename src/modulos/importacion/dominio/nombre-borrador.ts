import {
  LONGITUD_MAXIMA_NOMBRE_CONFIABLE,
  PREFIJO_NOMBRE_NO_LEIDO,
} from './advertencias.js';

/** Longitud máxima del nombre de un producto (igual que `POST /productos`). */
export const LONGITUD_MAXIMA_NOMBRE = 120;
/** Longitud máxima de la descripción que propone el lector de Yanbal. */
export const LONGITUD_MAXIMA_DESCRIPCION_LECTOR = 300;

/** Abreviaturas cuyo punto no termina una oración («largo aprox. 41 cm»). */
const ABREVIATURA_ANTES_DEL_PUNTO = /\b(?:aprox|máx|mín|etc|cont|núm|dscto|pág|págs|vs)$/i;

/** Posición del primer «.», «!» o «?» que cierra una oración (entre 3 y 80 caracteres), o `null`. */
function finDePrimeraOracion(texto: string): number | null {
  for (const coincidencia of texto.matchAll(/[.!?](?=\s|$)/g)) {
    const indice = coincidencia.index;
    if (indice > LONGITUD_MAXIMA_NOMBRE_CONFIABLE) {
      return null;
    }
    if (indice >= 3 && !ABREVIATURA_ANTES_DEL_PUNTO.test(texto.slice(0, indice))) {
      return indice;
    }
  }
  return null;
}

/**
 * Un texto largo no es un nombre: se corta en la primera oración (si cabe en
 * 80 caracteres) o en la última palabra que cabe, y el resto pasa a la
 * descripción. Siempre queda marcado como dudoso.
 */
export function partirNombreLargo(texto: string): {
  nombre: string;
  resto: string;
  recortado: boolean;
} {
  if ([...texto].length <= LONGITUD_MAXIMA_NOMBRE_CONFIABLE) {
    return { nombre: texto, resto: '', recortado: false };
  }
  const finOracion = finDePrimeraOracion(texto);
  const parentesis = texto.indexOf('(');
  // «Colección Verena Collar (largo aprox. 41 a 47 cm…)»: el paréntesis abre
  // los datos técnicos; el nombre se corta antes, no en el punto de «aprox.».
  if (
    parentesis >= 10 &&
    parentesis <= LONGITUD_MAXIMA_NOMBRE_CONFIABLE &&
    (finOracion === null || parentesis < finOracion)
  ) {
    return {
      nombre: texto.slice(0, parentesis).trim(),
      resto: texto.slice(parentesis).trim(),
      recortado: true,
    };
  }
  if (finOracion !== null) {
    return {
      nombre: texto.slice(0, finOracion).replace(/[.!?]+$/, '').trim(),
      resto: texto.slice(finOracion + 1).trim(),
      recortado: true,
    };
  }
  const corte = texto.lastIndexOf(' ', LONGITUD_MAXIMA_NOMBRE_CONFIABLE);
  const posicion = corte > 20 ? corte : LONGITUD_MAXIMA_NOMBRE_CONFIABLE;
  return {
    nombre: texto.slice(0, posicion).trim(),
    resto: texto.slice(posicion).trim(),
    recortado: true,
  };
}

/** Nombre utilizable: recortado a 120 caracteres o, si no hay, el marcador «Sin nombre». */
export function nombreDeBorrador(nombre: string, codigo: string | null): string {
  const caracteres = [...nombre];
  if (caracteres.length >= 2) {
    return caracteres.slice(0, LONGITUD_MAXIMA_NOMBRE).join('').trim();
  }
  return codigo === null
    ? PREFIJO_NOMBRE_NO_LEIDO
    : `${PREFIJO_NOMBRE_NO_LEIDO} (CÓD. ${codigo})`;
}
