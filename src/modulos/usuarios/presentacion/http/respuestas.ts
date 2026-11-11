import type { Pagina } from '../../../../compartido/dominio/paginacion.js';
import type { CodigoGenerado } from '../../aplicacion/casos-uso/generar-codigo-recuperacion.caso-uso.js';
import type { ResumenCliente } from '../../aplicacion/casos-uso/listar-clientes.caso-uso.js';
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

/** Elemento de `GET /api/v1/usuarios` (contrato de recuperación de clave). */
export interface RespuestaResumenCliente {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  activo: boolean;
  creadoEn: string;
  codigoRecuperacionVigenteHasta: string | null;
}

export interface RespuestaPaginaClientes {
  elementos: RespuestaResumenCliente[];
  pagina: number;
  tamanio: number;
  total: number;
}

/** Respuesta 201 de `POST /usuarios/{id}/codigo-recuperacion`. */
export interface RespuestaCodigoGenerado {
  codigo: string;
  venceEn: string;
  cliente: { id: string; nombre: string; correo: string };
}

export function aRespuestaPaginaClientes(
  pagina: Pagina<ResumenCliente>,
): RespuestaPaginaClientes {
  return {
    elementos: pagina.elementos.map((cliente) => ({
      id: cliente.id,
      nombre: cliente.nombre,
      correo: cliente.correo,
      telefono: cliente.telefono,
      activo: cliente.activo,
      creadoEn: cliente.creadoEn.toISOString(),
      codigoRecuperacionVigenteHasta:
        cliente.codigoRecuperacionVigenteHasta?.toISOString() ?? null,
    })),
    pagina: pagina.pagina,
    tamanio: pagina.tamanio,
    total: pagina.total,
  };
}

export function aRespuestaCodigoGenerado(
  generado: CodigoGenerado,
): RespuestaCodigoGenerado {
  return {
    codigo: generado.codigo,
    venceEn: generado.venceEn.toISOString(),
    cliente: { ...generado.cliente },
  };
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
