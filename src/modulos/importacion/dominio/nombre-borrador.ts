import {
  LONGITUD_MAXIMA_NOMBRE_CONFIABLE,
  PREFIJO_NOMBRE_NO_LEIDO,
} from './advertencias.js';

/** Longitud máxima del nombre de un producto (igual que `POST /productos`). */
export const LONGITUD_MAXIMA_NOMBRE = 120;
/** Longitud máxima de la descripción que propone el lector de Yanbal. */
export const LONGITUD_MAXIMA_DESCRIPCION_LECTOR = 300;

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
  const oracion = /^(.{3,80}?[.!?])(?:\s+|$)/su.exec(texto);
  if (oracion !== null) {
    return {
      nombre: oracion[1].replace(/[.!?]+$/, '').trim(),
      resto: texto.slice(oracion[0].length).trim(),
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
