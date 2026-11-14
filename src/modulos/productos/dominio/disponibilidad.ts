import { errorDeCampo } from '../../../compartido/dominio/error-campo.js';

/** Disponibilidad de un producto (RF-PRO-05, RN-09, D-47). */
export const DISPONIBILIDADES = [
  'DISPONIBLE',
  'AGOTADO',
  'PENDIENTE_REPOSICION',
] as const;

export type Disponibilidad = (typeof DISPONIBILIDADES)[number];

export const DISPONIBILIDAD_POR_DEFECTO: Disponibilidad = 'DISPONIBLE';

export const MENSAJE_DISPONIBILIDAD_INVALIDA =
  'La disponibilidad debe ser DISPONIBLE, AGOTADO o PENDIENTE_REPOSICION.';

export function esDisponibilidad(entrada: unknown): entrada is Disponibilidad {
  return (
    typeof entrada === 'string' &&
    (DISPONIBILIDADES as readonly string[]).includes(entrada)
  );
}

/** Valida la disponibilidad o falla con 400 `DATOS_INVALIDOS`. */
export function validarDisponibilidad(entrada: unknown): Disponibilidad {
  if (!esDisponibilidad(entrada)) {
    throw errorDeCampo('disponibilidad', MENSAJE_DISPONIBILIDAD_INVALIDA);
  }
  return entrada;
}
