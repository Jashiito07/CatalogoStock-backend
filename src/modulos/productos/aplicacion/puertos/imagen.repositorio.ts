import type { Imagen } from '../../dominio/imagen.js';

/** Puerto de persistencia de imágenes (tabla `imagenes_producto`, D-46). */
export interface ImagenRepositorio {
  /** Imágenes de un producto, por posición. */
  listarPorProducto(idProducto: string): Promise<Imagen[]>;

  /** Imágenes de varios productos con una sola consulta, por posición. */
  listarPorProductos(idsProducto: readonly string[]): Promise<Imagen[]>;

  /** La imagen de ese producto o `null` (una imagen ajena no se encuentra). */
  buscar(idProducto: string, idImagen: string): Promise<Imagen | null>;

  insertar(imagen: Imagen): Promise<void>;

  /** Actualiza la posición de cada imagen indicada. */
  guardarOrden(imagenes: readonly Imagen[]): Promise<void>;

  /** Borra la fila; `false` si no existía. */
  eliminar(idImagen: string): Promise<boolean>;
}

export const IMAGEN_REPOSITORIO = Symbol('IMAGEN_REPOSITORIO');
