/**
 * Eliminación de la cuenta del Cliente (RF-USU-06, PA-21, RN-16). TypeScript
 * puro.
 *
 * La cuenta **no se borra**: sus datos personales se anonimizan de forma
 * irreversible y las filas que la referencian (pedidos, pagos, bitácora) se
 * conservan apuntando a una cuenta que ya no identifica a nadie.
 */

/** Por dónde se eliminó la cuenta: la app (con la clave) o la web (con un código al correo). */
export const VIAS_ELIMINACION = ['APP', 'WEB'] as const;

export type ViaEliminacion = (typeof VIAS_ELIMINACION)[number];

/** Nombre que queda en la cuenta eliminada. */
export const NOMBRE_CUENTA_ELIMINADA = 'Cuenta eliminada';

/** Dominio reservado (RFC 2606): una dirección `.invalid` nunca es entregable. */
export const DOMINIO_CORREO_ELIMINADO = 'eliminada.invalid';

export interface DatosAnonimos {
  nombre: string;
  correo: string;
  telefono: string;
}

/**
 * Datos personales que reemplazan a los reales. Se derivan del id de la cuenta,
 * así que son únicos y no revelan nada de la persona:
 * - correo `eliminada-<id>@eliminada.invalid` (no entregable);
 * - teléfono `+000` y 9 dígitos del id (no es un celular de Ecuador válido,
 *   por eso nunca coincide con un número real).
 *
 * El correo y el teléfono originales quedan libres: se pueden volver a
 * registrar como una cuenta nueva.
 */
export function datosAnonimosDe(idUsuario: string): DatosAnonimos {
  const digitos = (BigInt(`0x${idUsuario.replaceAll('-', '')}`) % 10n ** 9n)
    .toString()
    .padStart(9, '0');
  return {
    nombre: NOMBRE_CUENTA_ELIMINADA,
    correo: `eliminada-${idUsuario.toLowerCase()}@${DOMINIO_CORREO_ELIMINADO}`,
    telefono: `+000${digitos}`,
  };
}
