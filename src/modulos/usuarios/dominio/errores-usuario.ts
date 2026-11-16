import {
  ConflictoError,
  ErrorDominio,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';

/** Ya existe una cuenta con ese correo (contrato de usuarios: 409 `CORREO_YA_REGISTRADO`). */
export class CorreoYaRegistradoError extends ConflictoError {
  constructor() {
    super('CORREO_YA_REGISTRADO', 'Ya existe una cuenta con ese correo.');
  }
}

/**
 * Ya existe un Vendedor (PA-09, D-21). Lo lanza el repositorio cuando la base
 * rechaza un segundo Vendedor (índice `uq_usuarios_un_vendedor`), por ejemplo
 * si dos ejecuciones del comando semilla coinciden.
 */
export class VendedorYaExisteError extends ConflictoError {
  constructor() {
    super('VENDEDOR_EXISTENTE', 'Ya existe un Vendedor.');
  }
}

/** 404 `USUARIO_NO_ENCONTRADO` (D-53): el id de `PATCH /usuarios/{id}/estado` no existe. */
export class UsuarioNoEncontradoError extends ErrorDominio {
  readonly categoria = 'NO_ENCONTRADO';

  constructor() {
    super('USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
  }
}

/** 422 `OPERACION_NO_PERMITIDA` (D-53): el Vendedor no se puede desactivar. */
export class OperacionNoPermitidaError extends ReglaNegocioError {
  constructor() {
    super(
      'OPERACION_NO_PERMITIDA',
      'No se puede desactivar la cuenta del Vendedor.',
    );
  }
}