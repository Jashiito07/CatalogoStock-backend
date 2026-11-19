import type { Borrador, ProductoExistente } from './borrador.js';

/**
 * Filtro `accion` de la lista de borradores (D-57): `ACTUALIZAR` (con producto
 * existente), `NUEVO` (crearán un producto) o `CAMBIO_PRECIO` (actualizarán un
 * producto cuyo precio cambia; excluye `SIN_CAMBIO`).
 */
export const ACCIONES_REVISION = ['ACTUALIZAR', 'NUEVO', 'CAMBIO_PRECIO'] as const;

export type AccionRevision = (typeof ACCIONES_REVISION)[number];

export function esAccionRevision(valor: unknown): valor is AccionRevision {
  return (
    typeof valor === 'string' &&
    (ACCIONES_REVISION as readonly string[]).includes(valor)
  );
}

/**
 * ¿El borrador cumple la `accion`? Solo un borrador `PENDIENTE` actualiza o
 * crea algo: los aprobados y descartados no cumplen ninguna.
 */
export function cumpleAccion(
  accion: AccionRevision,
  borrador: Borrador,
  existente: ProductoExistente | null,
): boolean {
  if (!borrador.esPendiente) {
    return false;
  }
  switch (accion) {
    case 'ACTUALIZAR':
      return existente !== null;
    case 'NUEVO':
      return existente === null;
    case 'CAMBIO_PRECIO':
      return (
        existente !== null &&
        borrador.precio !== null &&
        !borrador.precio.esIgualA(existente.precio)
      );
  }
}
