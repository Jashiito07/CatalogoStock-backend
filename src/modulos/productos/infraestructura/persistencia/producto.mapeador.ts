import { Dinero } from '../../../../compartido/dominio/dinero.js';
import { Producto } from '../../dominio/producto.js';
import { ProductoOrmEntity } from './producto.orm-entity.js';

/** Traduce entre la fila de `productos` y la entidad de dominio. */
export const ProductoMapeador = {
  aDominio(fila: ProductoOrmEntity): Producto {
    return Producto.reconstituir({
      id: fila.id,
      nombre: fila.nombre,
      marcaId: fila.idMarca,
      // `numeric` llega como texto exacto («12.50»).
      precio: Dinero.desdeTexto(fila.precio),
      descripcion: fila.descripcion,
      disponibilidad: fila.disponibilidad,
      creadoEn: fila.fechaCreacion,
      actualizadoEn: fila.fechaActualizacion,
    });
  },

  aPersistencia(producto: Producto): ProductoOrmEntity {
    const fila = new ProductoOrmEntity();
    fila.id = producto.id;
    fila.nombre = producto.nombre;
    fila.nombreBusqueda = producto.nombreBusqueda;
    fila.idMarca = producto.marcaId;
    fila.precio = producto.precio.aTexto();
    fila.descripcion = producto.descripcion;
    fila.descripcionBusqueda = producto.descripcionBusqueda;
    fila.disponibilidad = producto.disponibilidad;
    fila.eliminadoEn = null;
    fila.fechaCreacion = producto.creadoEn;
    fila.fechaActualizacion = producto.actualizadoEn;
    return fila;
  },
};
