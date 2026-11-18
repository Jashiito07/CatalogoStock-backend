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

  /**
   * Como `buscarPorId`, pero bloquea la fila hasta el fin de la transacción en
   * curso (`SELECT … FOR UPDATE`): serializa las altas de imágenes del mismo
   * producto para que nunca superen el límite (D-46).
   */
  bloquearPorId(id: string): Promise<Producto | null>;

  /** Ordenados por nombre (sin tildes ni mayúsculas) y luego por id. */
  listar(
    filtro: FiltroProductos,
    paginacion: Paginacion,
  ): Promise<Pagina<Producto>>;

  /** Falla con `CodigoDuplicadoError` si el código ya existe en la marca (D-57). */
  crear(producto: Producto): Promise<void>;

  /**
   * `false` si el producto ya no existe o está eliminado. Falla con
   * `CodigoDuplicadoError` si el código ya existe en la marca (D-57).
   */
  guardar(producto: Producto): Promise<boolean>;

  /** Los productos no eliminados de la marca cuyo código está entre `codigos` (D-57). */
  buscarPorCodigos(
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Producto[]>;

  /** Solo los códigos que ya tienen un producto no eliminado en la marca (consulta ligera). */
  codigosExistentes(
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Set<string>>;

  /**
   * El producto no eliminado de la marca con ese código, bloqueado hasta el
   * fin de la transacción en curso (`FOR UPDATE`): serializa las aprobaciones
   * del mismo código (D-57).
   */
  bloquearPorCodigo(marcaId: string, codigo: string): Promise<Producto | null>;

  /**
   * Productos no eliminados de la marca **sin código** cuya clave de
   * emparejamiento (`claveDeEmparejamiento` del nombre) está entre `claves`
   * (D-57, emparejado por nombre).
   */
  buscarSinCodigoPorClaves(
    marcaId: string,
    claves: readonly string[],
  ): Promise<Producto[]>;

  /**
   * Como `buscarSinCodigoPorClaves` para una sola clave, **bloqueando** los
   * productos encontrados y serializando (bloqueo asesor por marca y clave) a
   * quienes aprueban el mismo nombre a la vez, aunque aún no exista ninguno.
   */
  bloquearSinCodigoPorClave(marcaId: string, clave: string): Promise<Producto[]>;

  /**
   * Productos de la marca con código, no eliminados, cuyo código **no** está
   * en `codigosPresentes` (D-57, «ausentes»). Ordenados por nombre y id.
   */
  listarAusentes(
    marcaId: string,
    codigosPresentes: readonly string[],
    paginacion: Paginacion,
  ): Promise<Pagina<Producto>>;

  /** Marca el producto como eliminado; `false` si no existe o ya lo estaba. */
  marcarEliminado(id: string, ahora: Date): Promise<boolean>;
}

export const PRODUCTO_REPOSITORIO = Symbol('PRODUCTO_REPOSITORIO');
