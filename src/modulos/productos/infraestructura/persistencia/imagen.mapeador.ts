import { Imagen } from '../../dominio/imagen.js';
import { ImagenOrmEntity } from './imagen.orm-entity.js';

/** Traduce entre la fila de `imagenes_producto` y la entidad de dominio. */
export const ImagenMapeador = {
  aDominio(fila: ImagenOrmEntity): Imagen {
    return Imagen.reconstituir({
      id: fila.id,
      productoId: fila.idProducto,
      orden: fila.orden,
      tipo: fila.tipo,
      tamanioBytes: fila.tamanioBytes,
      creadaEn: fila.fechaCreacion,
    });
  },

  aPersistencia(imagen: Imagen): ImagenOrmEntity {
    const fila = new ImagenOrmEntity();
    fila.id = imagen.id;
    fila.idProducto = imagen.productoId;
    fila.orden = imagen.orden;
    fila.rutaRelativa = imagen.rutaRelativa;
    fila.tipo = imagen.tipo;
    fila.tamanioBytes = imagen.tamanioBytes;
    fila.fechaCreacion = imagen.creadaEn;
    return fila;
  },
};
