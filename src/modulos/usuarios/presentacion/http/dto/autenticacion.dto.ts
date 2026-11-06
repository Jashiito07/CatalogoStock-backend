import { IsNotEmpty, IsString } from 'class-validator';

export const MENSAJE_FALTA_CORREO = 'Ingrese su correo.';
export const MENSAJE_FALTA_CLAVE = 'Ingrese su clave.';
export const MENSAJE_FALTA_TOKEN = 'Falta el token de renovación.';

/**
 * Cuerpo de `POST /autenticacion/ingreso/cliente` y `/ingreso/vendedor`.
 * Solo se exige que vengan los dos campos (400 si falta alguno). Un correo
 * mal escrito no es 400: responde el mismo 401 que una clave incorrecta.
 */
export class IngresoDto {
  @IsString({ message: MENSAJE_FALTA_CORREO })
  @IsNotEmpty({ message: MENSAJE_FALTA_CORREO })
  correo: string;

  @IsString({ message: MENSAJE_FALTA_CLAVE })
  @IsNotEmpty({ message: MENSAJE_FALTA_CLAVE })
  clave: string;
}

/** Cuerpo de `POST /autenticacion/renovacion` y `/autenticacion/salida`. */
export class TokenRenovacionDto {
  @IsString({ message: MENSAJE_FALTA_TOKEN })
  @IsNotEmpty({ message: MENSAJE_FALTA_TOKEN })
  tokenRenovacion: string;
}
