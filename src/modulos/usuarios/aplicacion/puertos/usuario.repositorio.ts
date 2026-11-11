import type { Paginacion } from '../../../../compartido/dominio/paginacion.js';
import type { BusquedaClientes } from '../../dominio/busqueda-clientes.js';
import type { Correo } from '../../dominio/correo.js';
import type { Rol } from '../../dominio/rol.js';
import type { Usuario } from '../../dominio/usuario.js';

export interface PaginaUsuarios {
  usuarios: Usuario[];
  total: number;
}

/** Puerto de persistencia de usuarios. El adaptador TypeORM usa la tabla `usuarios`. */
export interface UsuarioRepositorio {
  buscarPorId(id: string): Promise<Usuario | null>;
  /** Usuarios con esos ids, en cualquier orden; los que no existen se omiten. */
  buscarPorIds(ids: readonly string[]): Promise<Usuario[]>;
  /** Busca por correo ya normalizado en minúsculas (el correo es único). */
  buscarPorCorreo(correo: Correo): Promise<Usuario | null>;
  /** El único Vendedor (PA-09, D-21), o `null` si todavía no existe. */
  buscarVendedor(): Promise<Usuario | null>;
  /** `true` si existe al menos un usuario con ese rol (activo o no). */
  existeConRol(rol: Rol): Promise<boolean>;
  /**
   * Inserta un usuario nuevo, dentro de la transacción en curso si la hay
   * (UnidadDeTrabajo). Si el correo ya está registrado, falla con
   * `CorreoYaRegistradoError` (`CORREO_YA_REGISTRADO`). Si es un Vendedor y la
   * base ya tiene uno, falla con `VendedorYaExisteError` (D-21).
   */
  crear(usuario: Usuario): Promise<void>;
  /**
   * Reemplaza el hash de la clave y la fecha de actualización (RF-USU-05),
   * dentro de la transacción en curso si la hay.
   */
  actualizarClave(
    idUsuario: string,
    hashClave: string,
    ahora: Date,
  ): Promise<void>;
  /**
   * Solo usuarios con rol `CLIENTE`, del más reciente al más antiguo, con la
   * búsqueda sin mayúsculas ni tildes en nombre, correo y teléfono.
   */
  listarClientes(
    busqueda: BusquedaClientes | null,
    paginacion: Paginacion,
  ): Promise<PaginaUsuarios>;
}

export const USUARIO_REPOSITORIO = Symbol('USUARIO_REPOSITORIO');
