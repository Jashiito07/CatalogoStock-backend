import { Marca } from '../../dominio/marca.js';
import { NombreMarca } from '../../dominio/nombre-marca.js';
import { MarcaOrmEntity } from './marca.orm-entity.js';

/** Traduce entre la fila de `marcas` y la entidad de dominio. */
export const MarcaMapeador = {
  aDominio(fila: MarcaOrmEntity): Marca {
    return Marca.reconstituir({
      id: fila.id,
      nombre: NombreMarca.crear(fila.nombre),
      color: fila.color,
      colorAcento: fila.colorAcento,
      activa: fila.activa,
      orden: fila.orden,
      creadaEn: fila.fechaCreacion,
      actualizadaEn: fila.fechaActualizacion,
    });
  },

  aPersistencia(marca: Marca): MarcaOrmEntity {
    const fila = new MarcaOrmEntity();
    fila.id = marca.id;
    fila.nombre = marca.nombre.valor;
    fila.nombreBusqueda = marca.nombre.clave;
    fila.color = marca.color;
    fila.colorAcento = marca.colorAcento;
    fila.activa = marca.activa;
    fila.orden = marca.orden;
    fila.fechaCreacion = marca.creadaEn;
    fila.fechaActualizacion = marca.actualizadaEn;
    return fila;
  },
};
