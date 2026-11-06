import { errorDeCampo } from './error-campo.js';

/**
 * Roles del sistema (RF-USU-02). Solo existen estos dos.
 * - `VENDEDOR`: administración completa desde el panel web (D-01). Uno solo (PA-09).
 * - `CLIENTE`: catálogo, carrito y pedidos desde la app móvil.
 */
export const ROLES = ['CLIENTE', 'VENDEDOR'] as const;

export type Rol = (typeof ROLES)[number];

export const MENSAJE_ROL_INVALIDO = 'El rol debe ser CLIENTE o VENDEDOR.';

export function esRol(valor: unknown): valor is Rol {
  return (
    typeof valor === 'string' && (ROLES as readonly string[]).includes(valor)
  );
}

/** Convierte un valor externo en `Rol` o falla con DATOS_INVALIDOS. */
export function crearRol(valor: unknown): Rol {
  if (!esRol(valor)) {
    throw errorDeCampo('rol', MENSAJE_ROL_INVALIDO);
  }
  return valor;
}
