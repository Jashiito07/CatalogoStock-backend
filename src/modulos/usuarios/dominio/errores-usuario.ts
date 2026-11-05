import { ConflictoError } from '../../../compartido/dominio/errores.js';

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
