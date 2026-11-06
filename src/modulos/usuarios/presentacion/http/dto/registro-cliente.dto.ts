import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  MENSAJE_CLAVE_DEBIL,
  validarFortalezaClave,
} from '../../../dominio/clave.js';
import { Correo, MENSAJE_CORREO_INVALIDO } from '../../../dominio/correo.js';
import {
  MENSAJE_NOMBRE_INVALIDO,
  NombreUsuario,
} from '../../../dominio/nombre-usuario.js';
import {
  MENSAJE_TELEFONO_INVALIDO,
  Telefono,
} from '../../../dominio/telefono.js';
import { CumpleReglaDominio } from './regla-dominio.js';

export const MENSAJE_ACEPTA_PRIVACIDAD =
  'Indique si acepta el aviso de privacidad.';
export const MENSAJE_VERSION_PRIVACIDAD =
  'Indique la versión del aviso de privacidad que aceptó.';

/**
 * Cuerpo de `POST /api/v1/usuarios/registro` (contrato de usuarios).
 *
 * No declara `rol`: con `forbidNonWhitelisted` cualquier campo no declarado,
 * incluido un intento de enviar `rol`, responde 400 `DATOS_INVALIDOS` (D-07).
 */
export class RegistroClienteDto {
  @CumpleReglaDominio(
    (valor) => NombreUsuario.crear(valor),
    MENSAJE_NOMBRE_INVALIDO,
  )
  nombre: string;

  @CumpleReglaDominio((valor) => Correo.crear(valor), MENSAJE_CORREO_INVALIDO)
  correo: string;

  @CumpleReglaDominio(
    (valor) => Telefono.crear(valor),
    MENSAJE_TELEFONO_INVALIDO,
  )
  telefono: string;

  @CumpleReglaDominio(validarFortalezaClave, MENSAJE_CLAVE_DEBIL)
  clave: string;

  /** Debe ser booleano; si es `false` el caso de uso responde 422 `PRIVACIDAD_NO_ACEPTADA`. */
  @IsBoolean({ message: MENSAJE_ACEPTA_PRIVACIDAD })
  aceptaPrivacidad: boolean;

  @IsString({ message: MENSAJE_VERSION_PRIVACIDAD })
  @IsNotEmpty({ message: MENSAJE_VERSION_PRIVACIDAD })
  @MaxLength(50, { message: MENSAJE_VERSION_PRIVACIDAD })
  versionPrivacidad: string;
}
