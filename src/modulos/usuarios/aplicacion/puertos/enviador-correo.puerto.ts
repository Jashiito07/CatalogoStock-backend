/** Correo listo para enviar (contrato de correo). */
export interface MensajeCorreo {
  /** Destinatario: siempre el correo registrado de la cuenta. */
  para: string;
  asunto: string;
  /** Cuerpo de texto sencillo. */
  texto: string;
  /** Cuerpo HTML mínimo, sin enlaces ni imágenes remotas. */
  html: string;
}

/**
 * Puerto de envío de correo (contrato de correo, D-50). Los adaptadores son
 * `nodemailer` (SMTP), el modo apagado (`CORREO_ACTIVO=false`) y, en las
 * pruebas, un transporte falso en memoria: las pruebas nunca envían correos reales.
 */
export interface EnviadorCorreo {
  /**
   * Envía el mensaje. Si el servicio de correo falla, rechaza con
   * `CorreoNoDisponibleError` (mensaje genérico, sin detalles técnicos ni
   * datos personales).
   */
  enviar(mensaje: MensajeCorreo): Promise<void>;
}

export const ENVIADOR_CORREO = Symbol('ENVIADOR_CORREO');
