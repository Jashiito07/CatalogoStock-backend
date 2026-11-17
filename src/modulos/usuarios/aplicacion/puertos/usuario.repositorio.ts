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
   * Guarda la fecha en que se verificó el correo (contrato de correo), dentro
   * de la transacción en curso si la hay.
   */
  marcarCorreoVerificado(idUsuario: string, ahora: Date): Promise<void>;
  /**
   * Cambia `activo` (D-53) solo si el valor es distinto, de forma atómica
   * (`UPDATE . WHERE activo <> :activo`), dentro de la transacción en curso
   * si la hay. Devuelve `true` si cambió la fila y `false` si ya tenía ese
   * valor (o no existe): así dos solicitudes simultáneas registran una sola vez.
   */
  actualizarActivo(
    idUsuario: string,
    activo: boolean,
    ahora: Date,
  ): Promise<boolean>;
  /**
   * Solo usuarios con rol `CLIENTE`, del más reciente al más antiguo, con la
   * búsqueda sin mayúsculas ni tildes en nombre, correo y teléfono y, si se
   * indica `activo`, solo los de ese estado (D-53) y, si se indica
   * `correoVerificado`, solo los verificados (`true`) o sin verificar
   * (`false`).
   */
  listarClientes(
    busqueda: BusquedaClientes | null,
    paginacion: Paginacion,
    activo?: boolean,
    correoVerificado?: boolean,
  ): Promise<PaginaUsuarios>;
}

export const USUARIO_REPOSITORIO = Symbol('USUARIO_REPOSITORIO');
