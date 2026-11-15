import { Logger } from '@nestjs/common';
import type {
  EnviadorCorreo,
  MensajeCorreo,
} from '../../aplicacion/puertos/enviador-correo.puerto.js';

/**
 * Adaptador de desarrollo sin credenciales (`CORREO_ACTIVO=false`): no envía
 * nada. Solo deja en el log el **hecho** de que se omitió un envío; nunca el
 * destinatario, el asunto, el cuerpo ni el código (contrato de correo, RN-16).
 */
export class EnviadorCorreoApagado implements EnviadorCorreo {
  private readonly logger = new Logger('Correo');

  enviar(_mensaje: MensajeCorreo): Promise<void> {
    this.logger.log('Envío de correo omitido (CORREO_ACTIVO=false).');
    return Promise.resolve();
  }
}
