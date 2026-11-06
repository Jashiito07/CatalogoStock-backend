import type { AvisoPrivacidad } from '../../dominio/aviso-privacidad.js';

/** Puerto que entrega el aviso de privacidad vigente (RNF-16, D-11, D-15). */
export interface FuenteAvisoPrivacidad {
  obtenerVigente(): AvisoPrivacidad;
}

export const FUENTE_AVISO_PRIVACIDAD = Symbol('FUENTE_AVISO_PRIVACIDAD');
