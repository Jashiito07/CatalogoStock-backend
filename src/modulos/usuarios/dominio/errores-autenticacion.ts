import {
  ErrorDominio,
  NoAutenticadoError,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';

/**
 * Motivo interno de un ingreso fallido (D-19, D-20). Solo se usa en la
 * bitácora (`SESION_FALLIDA`); **nunca** se envía en la respuesta.
 */
export type MotivoIngresoFallido =
  | 'CORREO_NO_REGISTRADO'
  | 'CREDENCIALES_INVALIDAS'
  | 'ROL_NO_PERMITIDO'
  | 'CUENTA_DESACTIVADA';

export const MENSAJE_CREDENCIALES_INVALIDAS = 'Correo o clave incorrectos.';

export const MENSAJE_CORREO_NO_REGISTRADO =
  'No existe una cuenta registrada con ese correo.';

export const MENSAJE_CUENTA_DESACTIVADA =
  'Tu cuenta está desactivada. Contacta a tu vendedor.';

/**
 * 401 `CORREO_NO_REGISTRADO` (D-52): solo en `/ingreso/cliente` (app), cuando
 * el correo no tiene cuenta. El panel sigue respondiendo el 401 genérico.
 */
export class CorreoNoRegistradoError extends NoAutenticadoError {
  constructor() {
    super('CORREO_NO_REGISTRADO', MENSAJE_CORREO_NO_REGISTRADO);
  }
}

/**
 * 403 `CUENTA_DESACTIVADA` (D-52, D-53): solo en `/ingreso/cliente` (app) y
 * solo cuando la clave es correcta, para no revelar el estado sin ella.
 */
export class CuentaDesactivadaError extends ErrorDominio {
  readonly categoria = 'NO_AUTORIZADO';

  constructor() {
    super('CUENTA_DESACTIVADA', MENSAJE_CUENTA_DESACTIVADA);
  }
}

/**
 * 401 `CREDENCIALES_INVALIDAS` (contrato de usuarios): correo inexistente,
 * clave incorrecta, cuenta inactiva o rol no permitido en el canal. El mensaje
 * y los detalles son siempre los mismos para no revelar si la cuenta existe.
 */
export class CredencialesInvalidasError extends NoAutenticadoError {
  constructor(readonly motivo: MotivoIngresoFallido) {
    super('CREDENCIALES_INVALIDAS', MENSAJE_CREDENCIALES_INVALIDAS);
  }
}

/**
 * 401 `TOKEN_INVALIDO`: el token de renovación no existe, venció, fue revocado
 * o la cuenta está inactiva (D-09). Mismo mensaje en todos los casos.
 */
export class TokenRenovacionInvalidoError extends NoAutenticadoError {
  constructor() {
    super('TOKEN_INVALIDO', 'La sesión no es válida. Inicie sesión de nuevo.');
  }
}

/** 401 `NO_AUTENTICADO`: falta el token de acceso, está mal formado o su firma no es válida. */
export class TokenAccesoAusenteError extends NoAutenticadoError {
  constructor() {
    super('NO_AUTENTICADO', 'Debe iniciar sesión para continuar.');
  }
}

/** 401 `TOKEN_VENCIDO`: el token de acceso venció; la app debe renovar la sesión. */
export class TokenAccesoVencidoError extends NoAutenticadoError {
  constructor() {
    super(
      'TOKEN_VENCIDO',
      'Su sesión venció. Renueve la sesión e inténtelo de nuevo.',
    );
  }
}

/** 422 `PRIVACIDAD_NO_ACEPTADA` (RNF-16, PA-12). */
export class PrivacidadNoAceptadaError extends ReglaNegocioError {
  constructor() {
    super(
      'PRIVACIDAD_NO_ACEPTADA',
      'Debe aceptar el aviso de privacidad para crear la cuenta.',
    );
  }
}

/** 422 `PRIVACIDAD_DESACTUALIZADA`: se aceptó una versión que ya no es la vigente (D-11). */
export class PrivacidadDesactualizadaError extends ReglaNegocioError {
  constructor(versionVigente: string) {
    super(
      'PRIVACIDAD_DESACTUALIZADA',
      'El aviso de privacidad cambió. Lea y acepte la versión vigente.',
      { versionVigente },
    );
  }
}
