/** SQLSTATE de PostgreSQL para violación de unicidad. */
const VIOLACION_UNICIDAD = '23505';

/**
 * Nombre de la restricción única violada en un error de TypeORM/pg
 * (SQLSTATE 23505), o `undefined` si el error es de otro tipo.
 */
export function restriccionUnicaVioladaEn(error: unknown): string | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('driverError' in error)
  ) {
    return undefined;
  }
  const original: unknown = error.driverError;
  if (
    typeof original === 'object' &&
    original !== null &&
    'code' in original &&
    original.code === VIOLACION_UNICIDAD &&
    'constraint' in original &&
    typeof original.constraint === 'string'
  ) {
    return original.constraint;
  }
  return undefined;
}
