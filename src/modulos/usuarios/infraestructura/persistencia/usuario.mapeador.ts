import { Correo } from '../../dominio/correo.js';
import { NombreUsuario } from '../../dominio/nombre-usuario.js';
import { crearRol } from '../../dominio/rol.js';
import { Telefono } from '../../dominio/telefono.js';
import { Usuario } from '../../dominio/usuario.js';
import { UsuarioOrmEntity } from './usuario.orm-entity.js';

/** Traduce entre la entidad de dominio y la fila de la tabla `usuarios`. */
export const UsuarioMapeador = {
  aDominio(fila: UsuarioOrmEntity): Usuario {
    return Usuario.reconstituir({
      id: fila.id,
      nombre: NombreUsuario.crear(fila.nombre),
      correo: Correo.crear(fila.correo),
      telefono: Telefono.crear(fila.telefono),
      hashClave: fila.hashClave,
      rol: crearRol(fila.rol),
      activo: fila.activo,
      privacidadAceptadaEn: fila.fechaAceptacionPrivacidad,
      versionPrivacidad: fila.versionPrivacidad,
      creadoEn: fila.fechaCreacion,
      actualizadoEn: fila.fechaActualizacion,
    });
  },

  aPersistencia(usuario: Usuario): UsuarioOrmEntity {
    const fila = new UsuarioOrmEntity();
    fila.id = usuario.id;
    fila.nombre = usuario.nombre.valor;
    fila.correo = usuario.correo.valor;
    fila.telefono = usuario.telefono.valor;
    fila.hashClave = usuario.hashClave;
    fila.rol = usuario.rol;
    fila.activo = usuario.activo;
    fila.fechaAceptacionPrivacidad = usuario.privacidadAceptadaEn;
    fila.versionPrivacidad = usuario.versionPrivacidad;
    fila.fechaCreacion = usuario.creadoEn;
    fila.fechaActualizacion = usuario.actualizadoEn;
    return fila;
  },
};
