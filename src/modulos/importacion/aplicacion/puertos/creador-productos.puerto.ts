/** Datos para crear un producto desde un borrador aprobado. */
export interface DatosProductoAprobado {
  /** Vendedor del token (queda en el `PRODUCTO_CREADO` habitual). */
  idVendedor: string;
  nombre: string;
  marcaId: string;
  /** Texto decimal exacto (`"35.00"`). */
  precio: string;
  descripcion: string;
  disponibilidad: string;
}

/**
 * Puerto con lo que `importacion` necesita de `productos`: crear un producto
 * con las mismas validaciones y la misma bitácora que `POST /productos`. El
 * adaptador usa el servicio público de `productos`; si se llama dentro de una
 * unidad de trabajo, se une a su transacción.
 *
 * Falla con un error de dominio (`MARCA_INACTIVA`, `DATOS_INVALIDOS`.).
 */
export interface CreadorProductos {
  /** Devuelve el id del producto creado. */
  crear(datos: DatosProductoAprobado): Promise<string>;
}

export const CREADOR_PRODUCTOS = Symbol('CREADOR_PRODUCTOS');
