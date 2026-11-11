import { IsOptional, IsString, Length } from 'class-validator';
import { PaginacionDto } from '../../../../../compartido/presentacion/paginacion.dto.js';
import {
  LONGITUD_MAXIMA_BUSQUEDA,
  MENSAJE_BUSQUEDA,
} from '../../../dominio/busqueda-clientes.js';

/**
 * Parámetros de `GET /api/v1/usuarios` (contrato de recuperación de clave):
 * paginación del README y `busqueda` opcional de 1 a 100 caracteres. Un
 * parámetro no declarado o repetido → 400 `DATOS_INVALIDOS`.
 */
export class ConsultaClientesDto extends PaginacionDto {
  @IsOptional()
  @IsString({ message: MENSAJE_BUSQUEDA })
  @Length(1, LONGITUD_MAXIMA_BUSQUEDA, { message: MENSAJE_BUSQUEDA })
  busqueda?: string;
}
