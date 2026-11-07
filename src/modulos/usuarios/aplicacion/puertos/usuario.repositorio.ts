import type { Correo } from '../../dominio/correo.js';
import type { Rol } from '../../dominio/rol.js';
import type { Usuario } from '../../dominio/usuario.js';

/** Puerto de persistencia de usuarios. El adaptador TypeORM usa la tabla `usuarios`. */
export interface UsuarioRepositorio {
  buscarPorId(id: string): Promise<Usuario | null>;
  /** Usuarios con esos ids, en cualquier orden; los que no existen se omiten. */
  buscarPorIds(ids: readonly string[]): Promise<Usuario[]>;
  /** Busca por correo ya normalizado en minúsculas (el correo es único). */
  buscarPorCorreo(correo: Correo): Promise<Usuario | null>;
  /** `true` si existe al menos un usuario con ese rol (activo o no). */
  existeConRol(rol: Rol): Promise<boolean>;
  /**
   * Inserta un usuario nuevo, dentro de la transacción en curso si la hay
   * (UnidadDeTrabajo). Si el correo ya está registrado, falla con
   * `CorreoYaRegistradoError` (`CORREO_YA_REGISTRADO`). Si es un Vendedor y la
   * base ya tiene uno, falla con `VendedorYaExisteError` (D-21).
   */
  crear(usuario: Usuario): Promise<void>;
}

export const USUARIO_REPOSITORIO = Symbol('USUARIO_REPOSITORIO');
