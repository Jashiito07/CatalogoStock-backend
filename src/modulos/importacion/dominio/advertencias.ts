import { Dinero } from '../../../compartido/dominio/dinero.js';

/**
 * Advertencias de un borrador (contrato de importación, «Borrador»). El
 * lector es conservador: lo que no entiende bien lo deja vacío y lo avisa.
 */
export const ADVERTENCIAS_BORRADOR = [
  'SIN_PRECIO',
  'PRECIO_HEREDADO',
  'SIN_CODIGO',
  'NOMBRE_DUDOSO',
  'PRECIO_EN_OFERTA',
  'CODIGO_REPETIDO',
  'YA_IMPORTADO',
  'EMPAREJADO_POR_NOMBRE',
  'EMPAREJAMIENTO_AMBIGUO',
  'VARIAS_REFERENCIAS',
] as const;

export type AdvertenciaBorrador = (typeof ADVERTENCIAS_BORRADOR)[number];

/**
 * Informativas: no piden revisar nada (PRECIO_EN_OFERTA: hay un precio normal
 * distinto del vigente; VARIAS_REFERENCIAS: perfil Leonisa, el producto tiene
 * varias referencias y todas van en la descripción; YA_IMPORTADO, D-57: el
 * código ya existe en un producto de la marca y al aprobar se actualizará su
 * precio; EMPAREJADO_POR_NOMBRE: igual, pero el borrador no tiene código y se
 * emparejó con un único producto sin código del mismo nombre;
 * EMPAREJAMIENTO_AMBIGUO: hay varios productos sin código con ese nombre, no se
 * empareja y al aprobar se crea uno nuevo).
 */
export const ADVERTENCIAS_INFORMATIVAS: readonly AdvertenciaBorrador[] = [
  'PRECIO_EN_OFERTA',
  'VARIAS_REFERENCIAS',
  'YA_IMPORTADO',
  'EMPAREJADO_POR_NOMBRE',
  'EMPAREJAMIENTO_AMBIGUO',
];

/**
 * Las que no se pueden deducir de los campos y se fijan al leer el PDF; una
 * edición no las cambia. `NOMBRE_DUDOSO` también puede fijarse al leer (un
 * nombre que el lector tuvo que recortar), y solo se recalcula si el Vendedor
 * edita el nombre. `YA_IMPORTADO` **no** se guarda: se deduce al leer el
 * borrador según si el producto existe en ese momento (D-57).
 */
export const ADVERTENCIAS_PERSISTENTES: readonly AdvertenciaBorrador[] = [
  'PRECIO_HEREDADO',
  'CODIGO_REPETIDO',
  'VARIAS_REFERENCIAS',
  'NOMBRE_DUDOSO',
];

/** Cómo se emparejó un borrador con un producto existente (D-57). */
export type EmparejadoPor = 'CODIGO' | 'NOMBRE';

/** Las advertencias que se deducen al leer el borrador y nunca se guardan (D-57). */
const ADVERTENCIAS_DE_EMPAREJAMIENTO: readonly AdvertenciaBorrador[] = [
  'YA_IMPORTADO',
  'EMPAREJADO_POR_NOMBRE',
  'EMPAREJAMIENTO_AMBIGUO',
];

/**
 * Agrega las advertencias informativas de emparejamiento (D-57),
 * conservando el orden del contrato y descartando las que hubiera guardadas:
 * `YA_IMPORTADO` si se emparejó por código, `EMPAREJADO_POR_NOMBRE` si fue por
 * nombre y `EMPAREJAMIENTO_AMBIGUO` si varios productos sin código tienen el nombre.
 */
export function conEmparejamiento(
  advertencias: readonly AdvertenciaBorrador[],
  emparejadoPor: EmparejadoPor | null,
  ambiguo: boolean,
): AdvertenciaBorrador[] {
  const presentes = new Set(
    advertencias.filter((a) => !ADVERTENCIAS_DE_EMPAREJAMIENTO.includes(a)),
  );
  if (emparejadoPor === 'CODIGO') {
    presentes.add('YA_IMPORTADO');
  } else if (emparejadoPor === 'NOMBRE') {
    presentes.add('EMPAREJADO_POR_NOMBRE');
  }
  if (ambiguo) {
    presentes.add('EMPAREJAMIENTO_AMBIGUO');
  }
  return ADVERTENCIAS_BORRADOR.filter((a) => presentes.has(a));
}

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
  /** `CODIGO_REPETIDO`, `VARIAS_REFERENCIAS` y un `NOMBRE_DUDOSO` fijado al leer, si ya estaban. */
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
