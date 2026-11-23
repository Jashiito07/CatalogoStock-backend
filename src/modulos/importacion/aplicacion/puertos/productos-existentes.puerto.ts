import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { Dinero } from '../../../../compartido/dominio/dinero.js';
import type { Disponibilidad } from '../../../productos/validaciones.js';

/** Un producto ya publicado con un código del catálogo (D-57). */
export interface ProductoConCodigo {
  id: string;
  nombre: string;
  codigo: string;
  precio: Dinero;
}

/** Un producto publicado **sin código** que puede emparejarse por nombre (D-57). */
export interface ProductoSinCodigo {
  id: string;
  nombre: string;
  precio: Dinero;
}

/** Producto de la marca que no aparece en el catálogo nuevo (D-57, «ausentes»). */
export interface ProductoAusente {
  id: string;
  nombre: string;
  codigo: string;
  precio: Dinero;
  disponibilidad: Disponibilidad;
}

/**
 * Puerto con lo que `importacion` necesita de `productos` para los catálogos
 * mensuales (D-57): buscar por código dentro de una marca, actualizar **solo
 * el precio** y listar los ausentes. Todo se limita a los productos del
 * Vendedor indicado (D-60). El adaptador usa el servicio público de
 * `productos`; nunca lee su tabla.
 */
export interface ProductosExistentes {
  /** Productos no eliminados del Vendedor en la marca con alguno de esos códigos. */
  buscarPorCodigos(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<ProductoConCodigo[]>;

  /** Entre `codigos`, los que ya tienen un producto no eliminado del Vendedor en la marca. */
  codigosExistentes(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Set<string>>;

  /** Como `buscarPorCodigos` para uno solo, **bloqueándolo** hasta el fin de la transacción en curso. */
  bloquearPorCodigo(
    idVendedor: string,
    marcaId: string,
    codigo: string,
  ): Promise<ProductoConCodigo | null>;

  /**
   * Productos no eliminados del Vendedor en la marca **sin código** cuyo nombre
   * coincide con alguno de `nombres` sin distinguir mayúsculas, tildes ni
   * signos (D-57). Nunca devuelve productos que tienen código.
   */
  buscarSinCodigoPorNombres(
    idVendedor: string,
    marcaId: string,
    nombres: readonly string[],
  ): Promise<ProductoSinCodigo[]>;

  /** Como `buscarSinCodigoPorNombres` para un nombre, **bloqueando** lo encontrado hasta el fin de la transacción en curso. */
  bloquearSinCodigoPorNombre(
    idVendedor: string,
    marcaId: string,
    nombre: string,
  ): Promise<ProductoSinCodigo[]>;

  /**
   * Cambia solo el precio, con la bitácora `PRODUCTO_ACTUALIZADO`
   * (`precioAnterior`, `precioNuevo`). Se une a la transacción en curso.
   */
  actualizarPrecio(datos: {
    idVendedor: string;
    idProducto: string;
    /** Texto decimal exacto (`"30.00"`). */
    precio: string;
  }): Promise<void>;

  /** Productos del Vendedor en la marca con código cuyo código no está en `codigosPresentes`. */
  listarAusentes(
    idVendedor: string,
    marcaId: string,
    codigosPresentes: readonly string[],
    paginacion: Paginacion,
  ): Promise<Pagina<ProductoAusente>>;
}

export const PRODUCTOS_EXISTENTES = Symbol('PRODUCTOS_EXISTENTES');
