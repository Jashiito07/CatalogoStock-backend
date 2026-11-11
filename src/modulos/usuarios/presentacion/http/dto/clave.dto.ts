import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  MENSAJE_CLAVE_DEBIL,
  validarFortalezaClave,
} from '../../../dominio/clave.js';
import { MENSAJE_CODIGO_FORMATO } from '../../../dominio/codigo-recuperacion.js';
import { Correo, MENSAJE_CORREO_INVALIDO } from '../../../dominio/correo.js';
import { MENSAJE_FALTA_TOKEN } from './autenticacion.dto.js';
import { CumpleReglaDominio } from './regla-dominio.js';

export const MENSAJE_FALTA_CLAVE_ACTUAL = 'Ingrese su clave actual.';

/**
 * Cuerpo de `POST /api/v1/autenticacion/recuperacion` (RF-USU-05). Formato
 * inválido → 400 `DATOS_INVALIDOS` sin repetir los valores enviados.
 */
export class RecuperacionClaveDto {
  @CumpleReglaDominio((valor) => Correo.crear(valor), MENSAJE_CORREO_INVALIDO)
  correo: string;

  /** Exactamente 6 dígitos (`000000` a `999999`). */
  @IsString({ message: MENSAJE_CODIGO_FORMATO })
  @Matches(/^\d{6}$/, { message: MENSAJE_CODIGO_FORMATO })
  codigo: string;

  @CumpleReglaDominio(validarFortalezaClave, MENSAJE_CLAVE_DEBIL)
  claveNueva: string;
}

/** Cuerpo de `POST /api/v1/usuarios/yo/clave` (RF-USU-05, cambio con sesión). */
export class CambioClaveDto {
  /** Solo se exige que venga; si no coincide → 422 `CLAVE_ACTUAL_INCORRECTA`. */
  @IsString({ message: MENSAJE_FALTA_CLAVE_ACTUAL })
  @IsNotEmpty({ message: MENSAJE_FALTA_CLAVE_ACTUAL })
  // Una clave válida tiene como máximo 72 caracteres: evita textos enormes.
  @MaxLength(200, { message: MENSAJE_FALTA_CLAVE_ACTUAL })
  claveActual: string;

  @CumpleReglaDominio(validarFortalezaClave, MENSAJE_CLAVE_DEBIL)
  claveNueva: string;

  /** Token de renovación de la sesión que se conserva (opcional). */
  @IsOptional()
  @IsString({ message: MENSAJE_FALTA_TOKEN })
  @IsNotEmpty({ message: MENSAJE_FALTA_TOKEN })
  @MaxLength(200, { message: MENSAJE_FALTA_TOKEN })
  tokenRenovacionActual?: string;
}
