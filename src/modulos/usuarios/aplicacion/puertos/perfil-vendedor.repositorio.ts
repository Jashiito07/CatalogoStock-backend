import type { PerfilVendedor } from '../../dominio/perfil-vendedor.js';

/** Puerto de persistencia del perfil comercial del Vendedor (tabla `perfiles_vendedor`, RF-USU-08). */
export interface PerfilVendedorRepositorio {
  /** El perfil del Vendedor o `null` si todavía no lo completó. */
  obtener(idUsuario: string): Promise<PerfilVendedor | null>;

  /**
   * Crea o reemplaza el perfil (`INSERT . ON CONFLICT DO UPDATE`), dentro de la
   * transacción en curso si la hay.
   */
  guardar(perfil: PerfilVendedor): Promise<void>;
}

export const PERFIL_VENDEDOR_REPOSITORIO = Symbol('PERFIL_VENDEDOR_REPOSITORIO');
