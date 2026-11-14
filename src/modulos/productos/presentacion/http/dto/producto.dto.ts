import { IsUUID, ValidateIf } from 'class-validator';
import { CumpleReglaDominio } from '../../../../../compartido/presentacion/regla-dominio.js';
import { PaginacionDto } from '../../../../../compartido/presentacion/paginacion.dto.js';
import {
  MENSAJE_BUSQUEDA_INVALIDA,
  validarBusqueda,
} from '../../../dominio/busqueda.js';
import {
  MENSAJE_DISPONIBILIDAD_INVALIDA,
  validarDisponibilidad,
} from '../../../dominio/disponibilidad.js';
import {
  MENSAJE_DESCRIPCION_INVALIDA,
  MENSAJE_MARCA_ID_INVALIDO,
  MENSAJE_NOMBRE_INVALIDO,
  MENSAJE_PRECIO_INVALIDO,
  validarDescripcion,
  validarNombreProducto,
  validarPrecio,
} from '../../../dominio/producto.js';

const presente = (_objeto: unknown, valor: unknown): boolean =>
  valor !== undefined;

/**
 * Cuerpo de `POST /api/v1/productos` (contrato de productos). Con
 * `forbidNonWhitelisted`, un campo no declarado responde 400 `DATOS_INVALIDOS`.
 * El precio solo se acepta como texto decimal («12.50»), nunca como número.
 */
export class CrearProductoDto {
  @CumpleReglaDominio(validarNombreProducto, MENSAJE_NOMBRE_INVALIDO)
  nombre: string;

  @IsUUID(undefined, { message: MENSAJE_MARCA_ID_INVALIDO })
  marcaId: string;

  @CumpleReglaDominio(validarPrecio, MENSAJE_PRECIO_INVALIDO)
  precio: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarDescripcion, MENSAJE_DESCRIPCION_INVALIDA)
  descripcion?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarDisponibilidad, MENSAJE_DISPONIBILIDAD_INVALIDA)
  disponibilidad?: string;
}

/** Cuerpo parcial de `PATCH /api/v1/productos/{id}`; ningún campo admite `null`. */
export class ActualizarProductoDto {
  @ValidateIf(presente)
  @CumpleReglaDominio(validarNombreProducto, MENSAJE_NOMBRE_INVALIDO)
  nombre?: string;

  @ValidateIf(presente)
  @IsUUID(undefined, { message: MENSAJE_MARCA_ID_INVALIDO })
  marcaId?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarPrecio, MENSAJE_PRECIO_INVALIDO)
  precio?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarDescripcion, MENSAJE_DESCRIPCION_INVALIDA)
  descripcion?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarDisponibilidad, MENSAJE_DISPONIBILIDAD_INVALIDA)
  disponibilidad?: string;
}

/**
 * Parámetros de `GET /api/v1/productos`: paginación del README más `marcaId`,
 * `busqueda` (1 a 100 caracteres) y `disponibilidad`.
 */
export class ConsultaProductosDto extends PaginacionDto {
  @ValidateIf(presente)
  @IsUUID(undefined, { message: MENSAJE_MARCA_ID_INVALIDO })
  marcaId?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarBusqueda, MENSAJE_BUSQUEDA_INVALIDA)
  busqueda?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarDisponibilidad, MENSAJE_DISPONIBILIDAD_INVALIDA)
  disponibilidad?: string;
}
