import { Sesion } from '../../dominio/sesion.js';
import { SesionOrmEntity } from './sesion.orm-entity.js';

/** Traduce entre la entidad de dominio Sesion y la fila de `sesiones`. */
export const SesionMapeador = {
  aDominio(fila: SesionOrmEntity): Sesion {
    return Sesion.reconstituir({
      id: fila.id,
      idUsuario: fila.idUsuario,
      familia: fila.familia,
      canal: fila.canal,
      hashToken: fila.hashToken,
      creadaEn: fila.fechaCreacion,
      venceEn: fila.fechaVencimiento,
      revocadaEn: fila.fechaRevocacion,
      motivoRevocacion: fila.motivoRevocacion,
    });
  },

  aPersistencia(sesion: Sesion): SesionOrmEntity {
    const fila = new SesionOrmEntity();
    fila.id = sesion.id;
    fila.idUsuario = sesion.idUsuario;
    fila.familia = sesion.familia;
    fila.canal = sesion.canal;
    fila.hashToken = sesion.hashToken;
    fila.fechaCreacion = sesion.creadaEn;
    fila.fechaVencimiento = sesion.venceEn;
    fila.fechaRevocacion = sesion.revocadaEn;
    fila.motivoRevocacion = sesion.motivoRevocacion;
    return fila;
  },
};
