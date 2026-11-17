/**
 * Marcas conocidas (RF-PRO-06, D-48, D-56): única fuente de la lista que ofrece
 * «Configura tu negocio» (`GET /marcas/sugeridas`) y de la regla de colores fijos.
 * Los colores son los medidos de fuentes oficiales (`docs/diseno/colores-marcas.md`).
 */
export interface MarcaSugerida {
  readonly nombre: string;
  readonly color: string;
  readonly colorAcento: string | null;
}

export const MARCAS_SUGERIDAS: readonly MarcaSugerida[] = Object.freeze([
  Object.freeze({ nombre: 'Yanbal', color: '#FC5823', colorAcento: null }),
  Object.freeze({ nombre: 'Avon', color: '#FF2469', colorAcento: null }),
  Object.freeze({ nombre: "L'Bel", color: '#2E1A47', colorAcento: null }),
  Object.freeze({ nombre: 'Cyzone', color: '#A90061', colorAcento: null }),
  Object.freeze({ nombre: 'Esika', color: '#E1251B', colorAcento: null }),
  Object.freeze({
    nombre: 'Leonisa',
    color: '#222221',
    colorAcento: '#F36E21',
  }),
]);

/**
 * Clave para reconocer una marca conocida: sin mayúsculas, tildes ni signos.
 * «L'Bel», «L´Bel», «lbel» y «Ésika» → `lbel`, `esika`. Solo letras y dígitos.
 */
export function claveMarcaConocida(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Marca conocida que corresponde al nombre (cualquier variante), o `null`. */
export function buscarMarcaConocida(nombre: string): MarcaSugerida | null {
  const clave = claveMarcaConocida(nombre);
  if (clave === '') {
    return null;
  }
  return (
    MARCAS_SUGERIDAS.find((m) => claveMarcaConocida(m.nombre) === clave) ??
    null
  );
}
