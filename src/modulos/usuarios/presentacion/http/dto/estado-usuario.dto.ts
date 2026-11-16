import { IsBoolean } from 'class-validator';

export const MENSAJE_ACTIVO_INVALIDO = 'El estado debe ser true o false.';

/**
 * Cuerpo de `PATCH /api/v1/usuarios/{id}/estado` (contrato usuarios-gestion,
 * D-53): `{ "activo": false }` desactiva y `{ "activo": true }` reactiva.
 * Ausente, no booleano o con campos no declarados → 400 `DATOS_INVALIDOS`.
 */
export class EstadoUsuarioDto {
  @IsBoolean({ message: MENSAJE_ACTIVO_INVALIDO })
  activo: boolean;
}
