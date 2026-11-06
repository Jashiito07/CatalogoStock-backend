import type { Rol } from './rol.js';

/**
 * Canal por el que se inicia una sesión (D-19).
 * - `APP`: app móvil del Cliente (`/autenticacion/ingreso/cliente`).
 * - `PANEL`: panel web del Vendedor (`/autenticacion/ingreso/vendedor`).
 */
export const CANALES = ['APP', 'PANEL'] as const;

export type Canal = (typeof CANALES)[number];

/** Único rol que acepta cada canal (D-01, D-19). */
export const ROL_DEL_CANAL: Readonly<Record<Canal, Rol>> = {
  APP: 'CLIENTE',
  PANEL: 'VENDEDOR',
};

export function esCanal(valor: unknown): valor is Canal {
  return (
    typeof valor === 'string' && (CANALES as readonly string[]).includes(valor)
  );
}

/** `true` si el rol puede iniciar o renovar una sesión en ese canal (D-19). */
export function rolPermitidoEnCanal(rol: Rol, canal: Canal): boolean {
  return ROL_DEL_CANAL[canal] === rol;
}
