import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { PaginacionDto } from '../../../../../compartido/presentacion/paginacion.dto.js';
import {
  LONGITUD_MAXIMA_BUSQUEDA,
  MENSAJE_BUSQUEDA,
} from '../../../dominio/busqueda-clientes.js';

export const MENSAJE_FILTRO_ACTIVO = 'El filtro activo debe ser true o false.';

/** Convierte solo el texto exacto `true` o `false`; cualquier otro valor lo rechaza `IsBoolean`. */
function aBooleanoDeConsulta({ value }: { value: unknown }): unknown {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
}

/**
 * Parámetros de `GET /api/v1/usuarios` (contratos de recuperación de clave y
 * usuarios-gestion): paginación del README, `busqueda` opcional de 1 a 100
 * caracteres y `activo=true|false` opcional (D-53). Un parámetro no declarado
 * o repetido → 400 `DATOS_INVALIDOS`.
 */
export class ConsultaClientesDto extends PaginacionDto {
  @IsOptional()
  @IsString({ message: MENSAJE_BUSQUEDA })
  @Length(1, LONGITUD_MAXIMA_BUSQUEDA, { message: MENSAJE_BUSQUEDA })
  busqueda?: string;

  @IsOptional()
  @Transform(aBooleanoDeConsulta)
  @IsBoolean({ message: MENSAJE_FILTRO_ACTIVO })
  activo?: boolean;
}
