import type { MotivoRevocacion, Sesion } from '../../dominio/sesion.js';

/** Puerto de persistencia de sesiones (tabla `sesiones`, D-09). */
export interface SesionRepositorio {
  crear(sesion: Sesion): Promise<void>;
  /** Busca por el hash del token de renovación (nunca por el token). */
  buscarPorHashToken(hashToken: string): Promise<Sesion | null>;
  /**
   * Guarda una rotación de forma **atómica**: marca `anterior` como rotada solo
   * si seguía sin revocar y, en la misma transacción, inserta `siguiente`.
   * Devuelve `false` (sin insertar nada) si otra solicitud ya la había revocado:
   * es una reutilización concurrente del mismo token.
   */
  guardarRotacion(anterior: Sesion, siguiente: Sesion): Promise<boolean>;
  /** Revoca todas las sesiones aún vigentes de la familia. Devuelve cuántas revocó. */
  revocarFamilia(
    familia: string,
    motivo: Exclude<MotivoRevocacion, 'ROTADA'>,
    ahora: Date,
  ): Promise<number>;
}

export const SESION_REPOSITORIO = Symbol('SESION_REPOSITORIO');
