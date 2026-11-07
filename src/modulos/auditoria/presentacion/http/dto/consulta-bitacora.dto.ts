import { IsIn, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginacionDto } from '../../../../../compartido/presentacion/paginacion.dto.js';
import {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
  ENTIDADES_AUDITORIA,
  type EntidadAuditoria,
} from '../../../dominio/catalogo-auditoria.js';

export const MENSAJE_ACCION =
  'La acción no pertenece al catálogo de la bitácora.';
export const MENSAJE_ENTIDAD =
  'La entidad no pertenece al catálogo de la bitácora.';
export const MENSAJE_ID_USUARIO =
  'El identificador del usuario debe ser un UUID.';
export const MENSAJE_ID_ENTIDAD =
  'El identificador de la entidad debe ser un UUID.';
export const MENSAJE_FECHA =
  'Use una fecha ISO 8601 con hora y zona horaria, por ejemplo 2026-11-05T00:00:00-05:00.';

/**
 * Fecha ISO 8601 con hora y zona horaria (convención del contrato, README),
 * con milisegundos como máximo. Una fecha sin hora («2026-11-05») se rechaza
 * porque no indica a qué instante del día se refiere `hasta` (inclusive).
 */
export const PATRON_FECHA_CON_ZONA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parámetros de `GET /api/v1/auditoria` (contrato de auditoría). Todos
 * opcionales; un parámetro no declarado → 400 `DATOS_INVALIDOS`.
 * `hasta` ≥ `desde` se comprueba en el dominio (`validarFiltrosBitacora`).
 */
export class ConsultaBitacoraDto extends PaginacionDto {
  @IsOptional()
  @IsIn(ACCIONES_AUDITORIA, { message: MENSAJE_ACCION })
  accion?: AccionAuditoria;

  @IsOptional()
  @IsUUID('all', { message: MENSAJE_ID_USUARIO })
  idUsuario?: string;

  @IsOptional()
  @IsIn(ENTIDADES_AUDITORIA, { message: MENSAJE_ENTIDAD })
  entidad?: EntidadAuditoria;

  @IsOptional()
  @IsUUID('all', { message: MENSAJE_ID_ENTIDAD })
  idEntidad?: string;

  @IsOptional()
  @Matches(PATRON_FECHA_CON_ZONA, { message: MENSAJE_FECHA })
  @IsISO8601({ strict: true }, { message: MENSAJE_FECHA })
  desde?: string;

  @IsOptional()
  @Matches(PATRON_FECHA_CON_ZONA, { message: MENSAJE_FECHA })
  @IsISO8601({ strict: true }, { message: MENSAJE_FECHA })
  hasta?: string;
}
