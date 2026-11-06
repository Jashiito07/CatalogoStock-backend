import type { FuenteAvisoPrivacidad } from '../../aplicacion/puertos/fuente-aviso-privacidad.puerto.js';
import type { AvisoPrivacidad } from '../../dominio/aviso-privacidad.js';
import { AVISO_PRIVACIDAD_VIGENTE } from './aviso-privacidad.provisional.js';

/**
 * El texto vive en el backend para poder cambiarlo sin publicar otra versión
 * de la app (contrato de usuarios).
 */
export class FuenteAvisoPrivacidadEstatica implements FuenteAvisoPrivacidad {
  constructor(
    private readonly aviso: AvisoPrivacidad = AVISO_PRIVACIDAD_VIGENTE,
  ) {}

  obtenerVigente(): AvisoPrivacidad {
    return this.aviso;
  }
}
