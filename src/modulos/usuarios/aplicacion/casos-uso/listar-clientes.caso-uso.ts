import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { crearBusquedaClientes } from '../../dominio/busqueda-clientes.js';
import type { CodigoRecuperacionRepositorio } from '../puertos/codigo-recuperacion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/** Elemento de `GET /api/v1/usuarios` (contrato de recuperación de clave). */
export interface ResumenCliente {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  activo: boolean;
  creadoEn: Date;
  /** Vencimiento del código vigente; nunca el código. */
  codigoRecuperacionVigenteHasta: Date | null;
}

/**
 * Lista de Clientes del panel (RF-USU-05, sección «Clientes»; RF-USU-03).
 * Solo el Vendedor llega aquí (`@Roles('VENDEDOR')`). Devuelve únicamente
 * usuarios con rol `CLIENTE`, del más reciente al más antiguo.
 */
export class ListarClientesCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly codigos: CodigoRecuperacionRepositorio,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    busqueda: string | undefined,
    paginacion: Paginacion,
  ): Promise<Pagina<ResumenCliente>> {
    const { usuarios, total } = await this.usuarios.listarClientes(
      crearBusquedaClientes(busqueda),
      paginacion,
    );
    const vencimientos = await this.codigos.vencimientosVigentes(
      usuarios.map((usuario) => usuario.id),
      this.reloj.ahora(),
    );
    return {
      elementos: usuarios.map((usuario) => ({
        id: usuario.id,
        nombre: usuario.nombre.valor,
        correo: usuario.correo.valor,
        telefono: usuario.telefono.valor,
        activo: usuario.activo,
        creadoEn: usuario.creadoEn,
        codigoRecuperacionVigenteHasta: vencimientos.get(usuario.id) ?? null,
      })),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total,
    };
  }
}
