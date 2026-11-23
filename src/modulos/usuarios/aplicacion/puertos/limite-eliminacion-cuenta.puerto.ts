/** Cuántos intentos admite una cuenta por hora al eliminarse con la clave (contrato cuenta-y-politicas, §1). */
export const INTENTOS_ELIMINACION_POR_HORA = 3;

export type ResultadoIntentoEliminacion =
  | { permitido: true }
  /** Se superó el límite: `reintentarEnSegundos` hasta que se libere un intento. */
  | { permitido: false; reintentarEnSegundos: number };

/**
 * Límite de intentos de `POST /usuarios/yo/eliminacion` **por cuenta** (no por
 * IP): 3 por hora, cuenten como acierto o como fallo, para que la clave no se
 * pueda adivinar por esta ruta (D-17, RF-USU-06).
 */
export interface LimiteEliminacionCuenta {
  /** Cuenta el intento y dice si se permite. Un intento rechazado no suma. */
  registrarIntento(
    idUsuario: string,
    ahora: Date,
  ): ResultadoIntentoEliminacion;
}

export const LIMITE_ELIMINACION_CUENTA = Symbol('LIMITE_ELIMINACION_CUENTA');
