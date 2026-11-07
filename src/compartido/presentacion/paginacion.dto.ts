import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  TAMANIO_MAXIMO,
  type Paginacion,
  crearPaginacion,
} from '../dominio/paginacion.js';

export const MENSAJE_PAGINA =
  'La página debe ser un número entero mayor o igual a 1.';
export const MENSAJE_TAMANIO = `El tamaño debe ser un número entero entre 1 y ${TAMANIO_MAXIMO}.`;

/**
 * Convierte a número solo un texto de dígitos (`"2"`). Cualquier otra cosa
 * (`"1.5"`, `"1e1"`, `" 2"`, un parámetro repetido) se deja tal cual y la
 * validación de entero la rechaza con 400 `DATOS_INVALIDOS`.
 */
export function aEnteroDeConsulta({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && /^\d{1,9}$/.test(value)
    ? Number(value)
    : value;
}

/**
 * Parámetros de paginación comunes (contrato, README): `pagina` ≥ 1 (por
 * defecto 1) y `tamanio` de 1 a 100 (por defecto 20). Los DTO de consulta de
 * cada módulo la extienden.
 */
export class PaginacionDto {
  @IsOptional()
  @Transform(aEnteroDeConsulta)
  @IsInt({ message: MENSAJE_PAGINA })
  @Min(1, { message: MENSAJE_PAGINA })
  pagina?: number;

  @IsOptional()
  @Transform(aEnteroDeConsulta)
  @IsInt({ message: MENSAJE_TAMANIO })
  @Min(1, { message: MENSAJE_TAMANIO })
  @Max(TAMANIO_MAXIMO, { message: MENSAJE_TAMANIO })
  tamanio?: number;
}

/** Paginación con los valores por defecto del contrato. */
export function paginacionDe(consulta: PaginacionDto): Paginacion {
  return crearPaginacion(consulta.pagina, consulta.tamanio);
}
