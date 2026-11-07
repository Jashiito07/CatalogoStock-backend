/**
 * Puerto de unidad de trabajo: ejecuta varias escrituras como una sola
 * transacción (backend-modulo-nestjs). Si el trabajo falla, no queda ninguna
 * de sus escrituras; por ejemplo, ni una operación sin su registro en la
 * bitácora ni un registro sin su operación (contrato de auditoría, CA-03).
 *
 * Una llamada dentro de otra se une a la transacción en curso.
 */
export interface UnidadDeTrabajo {
  ejecutar<T>(trabajo: () => Promise<T>): Promise<T>;
}

export const UNIDAD_DE_TRABAJO = Symbol('UNIDAD_DE_TRABAJO');
