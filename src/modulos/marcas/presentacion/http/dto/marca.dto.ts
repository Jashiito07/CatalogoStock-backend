import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';
import { CumpleReglaDominio } from '../../../../../compartido/presentacion/regla-dominio.js';
import {
  MENSAJE_COLOR_INVALIDO,
  normalizarColor,
} from '../../../dominio/color.js';
import {
  MENSAJE_ACTIVA_INVALIDA,
  MENSAJE_ORDEN_INVALIDO,
  validarOrden,
} from '../../../dominio/marca.js';
import {
  MENSAJE_NOMBRE_MARCA_INVALIDO,
  NombreMarca,
} from '../../../dominio/nombre-marca.js';

const validarNombre = (valor: unknown) => NombreMarca.crear(valor);
const validarColor = (valor: unknown) => normalizarColor(valor, 'color');
const validarAcento = (valor: unknown) => normalizarColor(valor, 'colorAcento');

/**
 * Cuerpo de `POST /api/v1/marcas` (contrato de productos). Con
 * `forbidNonWhitelisted`, un campo no declarado (por ejemplo `textoSobreColor`,
 * que es solo de lectura) responde 400 `DATOS_INVALIDOS`.
 */
export class CrearMarcaDto {
  @CumpleReglaDominio(validarNombre, MENSAJE_NOMBRE_MARCA_INVALIDO)
  nombre: string;

  @CumpleReglaDominio(validarColor, MENSAJE_COLOR_INVALIDO)
  color: string;

  /** `null` o ausente: sin color de acento. */
  @IsOptional()
  @CumpleReglaDominio(validarAcento, MENSAJE_COLOR_INVALIDO)
  colorAcento?: string | null;

  @ValidateIf((_objeto, valor: unknown) => valor !== undefined)
  @CumpleReglaDominio(validarOrden, MENSAJE_ORDEN_INVALIDO)
  orden?: number;
}

/**
 * Cuerpo parcial de `PATCH /api/v1/marcas/{id}`. `colorAcento: null` quita el
 * acento; el resto de campos no admite `null`.
 */
export class ActualizarMarcaDto {
  @ValidateIf((_objeto, valor: unknown) => valor !== undefined)
  @CumpleReglaDominio(validarNombre, MENSAJE_NOMBRE_MARCA_INVALIDO)
  nombre?: string;

  @ValidateIf((_objeto, valor: unknown) => valor !== undefined)
  @CumpleReglaDominio(validarColor, MENSAJE_COLOR_INVALIDO)
  color?: string;

  @IsOptional()
  @CumpleReglaDominio(validarAcento, MENSAJE_COLOR_INVALIDO)
  colorAcento?: string | null;

  @ValidateIf((_objeto, valor: unknown) => valor !== undefined)
  @IsBoolean({ message: MENSAJE_ACTIVA_INVALIDA })
  activa?: boolean;

  @ValidateIf((_objeto, valor: unknown) => valor !== undefined)
  @CumpleReglaDominio(validarOrden, MENSAJE_ORDEN_INVALIDO)
  orden?: number;
}

export const MENSAJE_INCLUIR_INACTIVAS =
  'incluirInactivas debe ser true o false.';

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

/** Parámetros de `GET /api/v1/marcas`. */
export class ConsultaMarcasDto {
  @IsOptional()
  @Transform(aBooleanoDeConsulta)
  @IsBoolean({ message: MENSAJE_INCLUIR_INACTIVAS })
  incluirInactivas?: boolean;
}
