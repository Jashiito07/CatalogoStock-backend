import { RegistroActividad } from '../../dominio/registro-actividad.js';
import { RegistroActividadOrmEntity } from './registro-actividad.orm-entity.js';

/** Traduce entre la entidad del dominio y la fila de `auditoria`. */
export const RegistroActividadMapeador = {
  aPersistencia(registro: RegistroActividad): RegistroActividadOrmEntity {
    const fila = new RegistroActividadOrmEntity();
    fila.id = registro.id;
    fila.fecha = registro.fecha;
    fila.accion = registro.accion;
    fila.idUsuario = registro.idUsuario;
    fila.entidad = registro.entidad;
    fila.idEntidad = registro.idEntidad;
    fila.detalle = { ...registro.detalle };
    return fila;
  },

  aDominio(fila: RegistroActividadOrmEntity): RegistroActividad {
    return RegistroActividad.reconstituir({
      id: fila.id,
      fecha: fila.fecha,
      accion: fila.accion,
      idUsuario: fila.idUsuario,
      entidad: fila.entidad,
      idEntidad: fila.idEntidad,
      detalle: fila.detalle,
    });
  },
};
