import { errorDeCampo } from '../../../compartido/dominio/error-campo.js';

/**
 * Colores de marca y contraste del texto (RF-PRO-04, D-43, RNF-11).
 * TypeScript puro y sin dependencias.
 */

export const MENSAJE_COLOR_INVALIDO =
  'El color debe tener la forma #RRGGBB (por ejemplo #2563EB).';

const PATRON_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Razón de contraste mínima para texto normal (WCAG AA, RNF-11). */
export const CONTRASTE_MINIMO = 4.5;

/**
 * Colores de texto candidatos, **en este orden**: el primero que llega a
 * 4.5:1 sobre el fondo es el elegido (contrato de productos, «Marca»).
 */
export const COLORES_TEXTO_CANDIDATOS = [
  '#FFFFFF',
  '#1E293B',
  '#0F172A',
  '#000000',
] as const;

export type ColorTexto = (typeof COLORES_TEXTO_CANDIDATOS)[number];

/** Valida `#RRGGBB` y lo devuelve en mayúsculas. `campo` nombra el campo del error. */
export function normalizarColor(entrada: unknown, campo = 'color'): string {
  if (typeof entrada !== 'string' || !PATRON_COLOR.test(entrada)) {
    throw errorDeCampo(campo, MENSAJE_COLOR_INVALIDO);
  }
  return entrada.toUpperCase();
}

/** Luminancia relativa WCAG de un color `#RRGGBB`. */
export function luminanciaRelativa(color: string): number {
  const canal = (inicio: number): number => {
    const valor = Number.parseInt(color.slice(inicio, inicio + 2), 16) / 255;
    return valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Razón de contraste WCAG entre dos colores `#RRGGBB` (de 1 a 21). */
export function razonDeContraste(colorA: string, colorB: string): number {
  const a = luminanciaRelativa(colorA);
  const b = luminanciaRelativa(colorB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Color de texto con contraste ≥ 4.5:1 sobre `fondo`: el primero de
 * `COLORES_TEXTO_CANDIDATOS` que lo cumple. Negro siempre cumple si ningún
 * otro lo hace (un fondo que no llega a 4.5:1 con blanco tiene luminancia
 * suficiente para el negro).
 */
export function textoSobre(fondo: string): ColorTexto {
  const color = normalizarColor(fondo);
  return (
    COLORES_TEXTO_CANDIDATOS.find(
      (candidato) => razonDeContraste(color, candidato) >= CONTRASTE_MINIMO,
    ) ?? '#000000'
  );
}
