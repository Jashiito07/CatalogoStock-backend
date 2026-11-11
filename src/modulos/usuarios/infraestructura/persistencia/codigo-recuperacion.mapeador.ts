import { CodigoRecuperacion } from '../../dominio/codigo-recuperacion.js';
import { CodigoRecuperacionOrmEntity } from './codigo-recuperacion.orm-entity.js';

/** Traduce entre la entidad de dominio y la fila de `codigos_recuperacion`. */
export const CodigoRecuperacionMapeador = {
  aDominio(fila: CodigoRecuperacionOrmEntity): CodigoRecuperacion {
    return CodigoRecuperacion.reconstituir({
      id: fila.id,
      idUsuario: fila.idUsuario,
      hashCodigo: fila.hashCodigo,
      generadoPor: fila.generadoPor,
      creadoEn: fila.fechaCreacion,
      venceEn: fila.fechaVencimiento,
      usadoEn: fila.fechaUso,
      invalidadoEn: fila.fechaInvalidacion,
      intentosFallidos: fila.intentosFallidos,
    });
  },

  aPersistencia(codigo: CodigoRecuperacion): CodigoRecuperacionOrmEntity {
    const fila = new CodigoRecuperacionOrmEntity();
    fila.id = codigo.id;
    fila.idUsuario = codigo.idUsuario;
    fila.hashCodigo = codigo.hashCodigo;
    fila.generadoPor = codigo.generadoPor;
    fila.fechaCreacion = codigo.creadoEn;
    fila.fechaVencimiento = codigo.venceEn;
    fila.fechaUso = codigo.usadoEn;
    fila.fechaInvalidacion = codigo.invalidadoEn;
    fila.intentosFallidos = codigo.intentosFallidos;
    return fila;
  },
};
