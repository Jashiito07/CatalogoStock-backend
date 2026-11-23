import {
  RUTA_ELIMINAR_CUENTA,
  RUTA_PRIVACIDAD,
  RUTA_TERMINOS,
  VERSION_PRIVACIDAD,
  VERSION_TERMINOS,
} from '../dominio/documentos-politicas.js';

export interface ResumenPoliticas {
  privacidad: { version: string; url: string };
  terminos: { version: string; url: string };
  eliminarCuenta: { url: string };
}

/**
 * `GET /api/v1/politicas` (RF-USU-07): versiones vigentes y direcciones de las
 * páginas públicas, armadas con `URL_PUBLICA`. La app las usa para enlazar.
 */
export class ConsultarPoliticasCasoUso {
  private readonly base: string;

  constructor(urlPublica: string) {
    this.base = urlPublica.replace(/\/+$/, '');
  }

  ejecutar(): ResumenPoliticas {
    return {
      privacidad: {
        version: VERSION_PRIVACIDAD,
        url: `${this.base}${RUTA_PRIVACIDAD}`,
      },
      terminos: {
        version: VERSION_TERMINOS,
        url: `${this.base}${RUTA_TERMINOS}`,
      },
      eliminarCuenta: { url: `${this.base}${RUTA_ELIMINAR_CUENTA}` },
    };
  }
}
