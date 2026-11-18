import { errorDeCampo } from '../../../compartido/dominio/error-campo.js';

export const LONGITUD_MINIMA_BUSQUEDA = 1;
export const LONGITUD_MAXIMA_BUSQUEDA = 100;

export const MENSAJE_BUSQUEDA_INVALIDA =
  'La búsqueda debe tener de 1 a 100 caracteres.';

/**
 * Clave de comparación para buscar: sin tildes, en minúsculas y con los
 * espacios repetidos unidos. «Crema Ésika» y «crema esika» coinciden (RF-CAT-03).
 * Se usa al guardar (`nombre_busqueda`, `descripcion_busqueda`) y al buscar.
 */
export function claveDeBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clave para **emparejar por nombre** un borrador sin código con un producto
 * (D-57): la clave de búsqueda (sin tildes, minúsculas) sin signos ni
 * símbolos, solo letras y dígitos separados por un espacio. «Crema  Ésika, 50
 * g.» y «crema esika 50 g» coinciden. Vacía si el nombre no tiene letras ni
 * dígitos (no se empareja). La consulta de `productos` aplica la misma regla en
 * SQL sobre `nombre_busqueda` (`[^a-z0-9]+` → espacio).
 */
export function claveDeEmparejamiento(nombre: string): string {
  return claveDeBusqueda(nombre).replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Valida el parámetro `busqueda` (1 a 100 caracteres tras recortar) y devuelve
 * su clave de comparación.
 */
export function validarBusqueda(entrada: unknown): string {
  if (typeof entrada !== 'string') {
    throw errorDeCampo('busqueda', MENSAJE_BUSQUEDA_INVALIDA);
  }
  const longitud = [...entrada.trim()].length;
  if (
    longitud < LONGITUD_MINIMA_BUSQUEDA ||
    longitud > LONGITUD_MAXIMA_BUSQUEDA
  ) {
    throw errorDeCampo('busqueda', MENSAJE_BUSQUEDA_INVALIDA);
  }
  return claveDeBusqueda(entrada);
}
