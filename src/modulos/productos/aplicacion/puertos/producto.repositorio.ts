import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { Disponibilidad } from '../../dominio/disponibilidad.js';
import type { Producto } from '../../dominio/producto.js';

export interface FiltroProductos {
  /** Solo productos de estas marcas (lista vacía: ninguno). */
  marcaIds?: readonly string[];
  /** Clave de búsqueda (sin tildes ni mayúsculas) sobre nombre y descripción. */
  clave?: string;
  disponibilidad?: Disponibilidad;
}

/**
 * Puerto de persistencia de productos (tabla `productos`). Todas las consultas
 * ignoran los productos eliminados (eliminación lógica, PA-07).
 */
export interface ProductoRepositorio {
  /** El producto no eliminado o `null`. */
  buscarPorId(id: string): Promise<Producto | null>;

  /** Ordenados por nombre (sin tildes ni mayúsculas) y luego por id. */
  listar(
    filtro: FiltroProductos,
    paginacion: Paginacion,
  ): Promise<Pagina<Producto>>;

  crear(producto: Producto): Promise<void>;

  /** `false` si el producto ya no existe o está eliminado. */
  guardar(producto: Producto): Promise<boolean>;

  /** Marca el producto como eliminado; `false` si no existe o ya lo estaba. */
  marcarEliminado(id: string, ahora: Date): Promise<boolean>;
}

export const PRODUCTO_REPOSITORIO = Symbol('PRODUCTO_REPOSITORIO');
