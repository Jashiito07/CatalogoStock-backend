/** Puerto para comprobar si la base de datos responde. */
export interface ComprobadorBaseDatos {
  /** `true` si la base de datos responde; nunca lanza errores. */
  estaDisponible(): Promise<boolean>;
}

export const COMPROBADOR_BASE_DATOS = Symbol('COMPROBADOR_BASE_DATOS');
