/**
 * Lista fija que ofrece «Configura tu negocio» (RF-PRO-06, D-48). Los colores
 * son los medidos de fuentes oficiales (`docs/diseno/colores-marcas.md`).
 */
export interface MarcaSugerida {
  readonly nombre: string;
  readonly color: string;
  readonly colorAcento: string | null;
}

export const MARCAS_SUGERIDAS: readonly MarcaSugerida[] = Object.freeze([
  { nombre: 'Yanbal', color: '#FC5823', colorAcento: null },
  { nombre: 'Avon', color: '#FF2469', colorAcento: null },
  { nombre: "L'Bel", color: '#2E1A47', colorAcento: null },
  { nombre: 'Cyzone', color: '#A90061', colorAcento: null },
  { nombre: 'Esika', color: '#E1251B', colorAcento: null },
  { nombre: 'Leonisa', color: '#222221', colorAcento: '#F36E21' },
]);
