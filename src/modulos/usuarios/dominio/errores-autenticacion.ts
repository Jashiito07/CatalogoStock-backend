import {
  NoAutenticadoError,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';

/**
 * Motivo interno de un ingreso fallido (D-19, D-20). Solo se usará en la
 * bitácora (`SESION_FALLIDA`, subfase 1.5); **nunca** se envía en la respuesta.
 */
export type MotivoIngresoFallido =
  'CREDENCIALES_INVALIDAS' | 'ROL_NO_PERMITIDO';

export const MENSAJE_CREDENCIALES_INVALIDAS = 'Correo o clave incorrectos.';

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
