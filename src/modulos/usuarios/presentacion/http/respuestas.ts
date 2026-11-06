import type { SesionEmitida } from '../../aplicacion/dto/sesion-emitida.js';
import type { AvisoPrivacidad } from '../../dominio/aviso-privacidad.js';
import type { Rol } from '../../dominio/rol.js';
import type { UsuarioPublico } from '../../dominio/usuario.js';

/** «Usuario (respuesta pública)» del contrato: nunca la clave, su hash ni tokens. */
export interface RespuestaUsuario {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: Rol;
  privacidadAceptadaEn: string | null;
  versionPrivacidad: string | null;
  creadoEn: string;
}

/** «Sesión» del contrato. */
export interface RespuestaSesion {
  tokenAcceso: string;
  venceAccesoEn: string;
  tokenRenovacion: string;
  venceRenovacionEn: string;
  usuario: RespuestaUsuario;
}

export interface RespuestaAvisoPrivacidad {
  version: string;
  titulo: string;
  contenido: string;
  vigenteDesde: string;
}

export function aRespuestaUsuario(usuario: UsuarioPublico): RespuestaUsuario {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    telefono: usuario.telefono,
    rol: usuario.rol,
    privacidadAceptadaEn: usuario.privacidadAceptadaEn?.toISOString() ?? null,
    versionPrivacidad: usuario.versionPrivacidad,
    creadoEn: usuario.creadoEn.toISOString(),
  };
}

export function aRespuestaSesion(sesion: SesionEmitida): RespuestaSesion {
  return {
    tokenAcceso: sesion.tokenAcceso,
    venceAccesoEn: sesion.venceAccesoEn.toISOString(),
    tokenRenovacion: sesion.tokenRenovacion,
    venceRenovacionEn: sesion.venceRenovacionEn.toISOString(),
    usuario: aRespuestaUsuario(sesion.usuario),
  };
}

export function aRespuestaAviso(
  aviso: AvisoPrivacidad,
): RespuestaAvisoPrivacidad {
  return {
    version: aviso.version,
    titulo: aviso.titulo,
    contenido: aviso.contenido,
    vigenteDesde: aviso.vigenteDesde.toISOString(),
  };
}
