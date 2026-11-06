import type { AvisoPrivacidad } from '../../dominio/aviso-privacidad.js';
import type { FuenteAvisoPrivacidad } from '../puertos/fuente-aviso-privacidad.puerto.js';

/** Devuelve el aviso de privacidad vigente (RNF-16, D-11, D-15). */
export class ConsultarAvisoPrivacidadCasoUso {
  constructor(private readonly fuente: FuenteAvisoPrivacidad) {}

  ejecutar(): AvisoPrivacidad {
    return this.fuente.obtenerVigente();
  }
}
