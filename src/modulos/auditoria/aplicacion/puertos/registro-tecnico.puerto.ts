/**
 * Log técnico de la bitácora (no es la bitácora). Solo recibe mensajes
 * redactados por el servicio: acciones, nombres de campo y clases de error,
 * nunca valores, correos, claves ni tokens (backend-seguridad).
 */
export interface RegistroTecnico {
  advertir(mensaje: string): void;
  error(mensaje: string): void;
}

export const REGISTRO_TECNICO_AUDITORIA = Symbol('REGISTRO_TECNICO_AUDITORIA');
