/** Vida de los tokens de la sesión (D-09), leída de las variables de entorno. */
export interface ConfiguracionSesion {
  /** `JWT_VIDA_ACCESO_SEGUNDOS` (900). */
  vidaAccesoSegundos: number;
  /** `RENOVACION_VIDA_DIAS` (7). */
  vidaRenovacionDias: number;
}

export const CONFIGURACION_SESION = Symbol('CONFIGURACION_SESION');
