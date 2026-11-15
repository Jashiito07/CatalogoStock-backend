import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type {
  EnviadorCorreo,
  MensajeCorreo,
} from '../../aplicacion/puertos/enviador-correo.puerto.js';
import { CorreoNoDisponibleError } from '../../dominio/errores-correo.js';

/** Configuración SMTP (variables `SMTP_*` y `CORREO_REMITENTE`). */
export interface OpcionesSmtp {
  servidor: string;
  puerto: number;
  usuario: string;
  clave: string;
  /** Remitente visible: «CatálogoStock <correo@ejemplo.com>». */
  remitente: string;
}

/** Lo único que se usa del transporte de nodemailer; permite sustituirlo en las pruebas. */
export interface TransporteCorreo {
  sendMail(mensaje: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

/** Puerto con TLS directo (SMTPS); cualquier otro usa STARTTLS. */
const PUERTO_TLS_DIRECTO = 465;
const ESPERA_CONEXION_MS = 10_000;
const ESPERA_SOCKET_MS = 15_000;

/** Un código de error de red o SMTP (`EAUTH`, `ECONNECTION`…); si no lo parece, `DESCONOCIDO`. */
function codigoSeguro(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const codigo: unknown = error.code;
    if (typeof codigo === 'string' && /^[A-Z0-9_]{1,30}$/.test(codigo)) {
      return codigo;
    }
  }
  return 'DESCONOCIDO';
}

/**
 * Adaptador `nodemailer` del puerto EnviadorCorreo (SMTP, contrato de correo, D-50).
 *
 * - La contraseña de aplicación solo vive en este objeto (campo privado `#`) y
 *   en el transporte; `toJSON` devuelve vacío para que no salga si se
 *   serializa por error.
 * - Si el envío falla, registra **solo** un aviso genérico con el código de
 *   error (nunca el destinatario, el asunto, el cuerpo, el mensaje del
 *   servidor ni las credenciales) y rechaza con `CorreoNoDisponibleError`
 *   (503 `CORREO_NO_DISPONIBLE`), también genérico.
 * - Tiempos de espera acotados: un SMTP que no responde no cuelga la API.
 */
export class EnviadorCorreoNodemailer implements EnviadorCorreo {
  private readonly logger = new Logger('Correo');
  readonly #remitente: string;
  readonly #transporte: TransporteCorreo;

  constructor(opciones: OpcionesSmtp, transporte?: TransporteCorreo) {
    this.#remitente = opciones.remitente;
    this.#transporte =
      transporte ??
      createTransport({
        host: opciones.servidor,
        port: opciones.puerto,
        secure: opciones.puerto === PUERTO_TLS_DIRECTO,
        auth: { user: opciones.usuario, pass: opciones.clave },
        connectionTimeout: ESPERA_CONEXION_MS,
        greetingTimeout: ESPERA_CONEXION_MS,
        socketTimeout: ESPERA_SOCKET_MS,
      });
  }

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    try {
      await this.#transporte.sendMail({
        from: this.#remitente,
        to: mensaje.para,
        subject: mensaje.asunto,
        text: mensaje.texto,
        html: mensaje.html,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo enviar un correo (error ${codigoSeguro(error)}).`,
      );
      throw new CorreoNoDisponibleError();
    }
  }

  toJSON(): Record<string, never> {
    return {};
  }
}
