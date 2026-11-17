import { Dinero } from '../../../../compartido/dominio/dinero.js';
import { Borrador } from '../../dominio/borrador.js';
import { BorradorOrmEntity } from './borrador.orm-entity.js';

/** Traduce entre la fila de `borradores_producto` y la entidad de dominio. */
export const BorradorMapeador = {
  aDominio(fila: BorradorOrmEntity): Borrador {
    return Borrador.reconstituir({
      id: fila.id,
      idImportacion: fila.idImportacion,
      pagina: fila.pagina,
      posicion: fila.posicion,
      codigo: fila.codigo,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      // `numeric` llega como texto exacto (`"12.50"`).
      precio: fila.precio === null ? null : Dinero.desdeTexto(fila.precio),
      precioNormal:
        fila.precioNormal === null ? null : Dinero.desdeTexto(fila.precioNormal),
      marcaId: fila.idMarca,
      disponibilidad: fila.disponibilidad,
      estado: fila.estado,
      advertencias: fila.advertencias,
      idProducto: fila.idProducto,
      creadoEn: fila.fechaCreacion,
      actualizadoEn: fila.fechaActualizacion,
    });
  },

  aPersistencia(borrador: Borrador): BorradorOrmEntity {
    const fila = new BorradorOrmEntity();
    fila.id = borrador.id;
    fila.idImportacion = borrador.idImportacion;
    fila.pagina = borrador.pagina;
    fila.posicion = borrador.posicion;
    fila.codigo = borrador.codigo;
    fila.nombre = borrador.nombre;
    fila.nombreBusqueda = borrador.nombreBusqueda;
    fila.descripcion = borrador.descripcion;
    fila.precio = borrador.precio === null ? null : borrador.precio.aTexto();
    fila.precioNormal =
      borrador.precioNormal === null ? null : borrador.precioNormal.aTexto();
    fila.idMarca = borrador.marcaId;
    fila.disponibilidad = borrador.disponibilidad;
    fila.estado = borrador.estado;
    fila.advertencias = [...borrador.advertencias];
    fila.idProducto = borrador.idProducto;
    fila.fechaCreacion = borrador.creadoEn;
    fila.fechaActualizacion = borrador.actualizadoEn;
    return fila;
  },
};
