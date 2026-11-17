import { Dinero } from '../../../compartido/dominio/dinero.js';

/**
 * Advertencias de un borrador (contrato de importación, «Borrador»). El
 * lector es conservador: lo que no entiende bien lo deja vacío y lo avisa.
 */
export const ADVERTENCIAS_BORRADOR = [
  'SIN_PRECIO',
  'SIN_CODIGO',
  'NOMBRE_DUDOSO',
  'PRECIO_EN_OFERTA',
  'CODIGO_REPETIDO',
  'YA_IMPORTADO',
  'VARIAS_REFERENCIAS',
] as const;

export type AdvertenciaBorrador = (typeof ADVERTENCIAS_BORRADOR)[number];

/**
 * Informativas: no piden revisar nada (PRECIO_EN_OFERTA: hay un precio normal
 * distinto del vigente; VARIAS_REFERENCIAS: perfil Leonisa, el producto tiene
 * varias referencias y todas van en la descripción).
 */
export const ADVERTENCIAS_INFORMATIVAS: readonly AdvertenciaBorrador[] = [
  'PRECIO_EN_OFERTA',
  'VARIAS_REFERENCIAS',
];

/**
 * Las que no se pueden deducir de los campos y se fijan al leer el PDF o al
 * crear la importación; una edición no las cambia. `NOMBRE_DUDOSO` también
 * puede fijarse al leer (un nombre que el lector tuvo que recortar), y solo
 * se recalcula si el Vendedor edita el nombre.
 */
export const ADVERTENCIAS_PERSISTENTES: readonly AdvertenciaBorrador[] = [
  'CODIGO_REPETIDO',
  'YA_IMPORTADO',
  'VARIAS_REFERENCIAS',
  'NOMBRE_DUDOSO',
];

/** Un nombre de menos de 3 caracteres es «muy corto» (contrato). */
export const LONGITUD_MINIMA_NOMBRE_CONFIABLE = 3;
/** Un nombre de más de 80 caracteres es «muy largo» (contrato). */
export const LONGITUD_MAXIMA_NOMBRE_CONFIABLE = 80;

/** Texto con el que se reemplaza un nombre que el lector no pudo leer. */
export const PREFIJO_NOMBRE_NO_LEIDO = 'Sin nombre';

/** `true` si el nombre es muy corto, muy largo, solo números o el marcador de «no leído». */
export function esNombreDudoso(nombre: string): boolean {
  const recortado = nombre.trim();
  const longitud = [...recortado].length;
  return (
    longitud < LONGITUD_MINIMA_NOMBRE_CONFIABLE ||
    longitud > LONGITUD_MAXIMA_NOMBRE_CONFIABLE ||
    !/\p{L}/u.test(recortado) ||
    recortado.startsWith(PREFIJO_NOMBRE_NO_LEIDO)
  );
}

export interface DatosAdvertencias {
  codigo: string | null;
  nombre: string;
  precio: Dinero | null;
  precioNormal: Dinero | null;
  /** `CODIGO_REPETIDO`, `YA_IMPORTADO` y un `NOMBRE_DUDOSO` fijado al leer, si ya estaban. */
  persistentes?: readonly AdvertenciaBorrador[];
}

/** Calcula las advertencias en el orden del contrato, sin repetir. */
export function calcularAdvertencias(
  datos: DatosAdvertencias,
): AdvertenciaBorrador[] {
  const presentes = new Set<AdvertenciaBorrador>();
  if (datos.precio === null) {
    presentes.add('SIN_PRECIO');
  }
  if (datos.codigo === null) {
    presentes.add('SIN_CODIGO');
  }
  if (esNombreDudoso(datos.nombre)) {
    presentes.add('NOMBRE_DUDOSO');
  }
  if (
    datos.precio !== null &&
    datos.precioNormal !== null &&
    !datos.precio.esIgualA(datos.precioNormal)
  ) {
    presentes.add('PRECIO_EN_OFERTA');
  }
  for (const advertencia of datos.persistentes ?? []) {
    if ((ADVERTENCIAS_PERSISTENTES as readonly string[]).includes(advertencia)) {
      presentes.add(advertencia);
    }
  }
  return ADVERTENCIAS_BORRADOR.filter((advertencia) =>
    presentes.has(advertencia),
  );
}

/** Cuenta para «con advertencias» si tiene alguna distinta de la informativa. */
export function requiereRevision(
  advertencias: readonly AdvertenciaBorrador[],
): boolean {
  return advertencias.some((advertencia) => !ADVERTENCIAS_INFORMATIVAS.includes(advertencia));
}
