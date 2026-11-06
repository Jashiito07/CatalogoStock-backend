import type { Sesion } from '../../dominio/sesion.js';
import type { Usuario, UsuarioPublico } from '../../dominio/usuario.js';
import type { TokenAccesoEmitido } from '../puertos/emisor-token-acceso.puerto.js';

/** Respuesta «Sesión» del contrato de usuarios (ingreso y renovación). */
export interface SesionEmitida {
  tokenAcceso: string;
  venceAccesoEn: Date;
  /** Token opaco; solo se entrega aquí, el servidor guarda su hash (D-09). */
  tokenRenovacion: string;
  venceRenovacionEn: Date;
  usuario: UsuarioPublico;
}

export function componerSesionEmitida(
  acceso: TokenAccesoEmitido,
  tokenRenovacion: string,
  sesion: Sesion,
  usuario: Usuario,
): SesionEmitida {
  return {
    tokenAcceso: acceso.token,
    venceAccesoEn: acceso.venceEn,
    tokenRenovacion,
    venceRenovacionEn: sesion.venceEn,
    usuario: usuario.aPublico(),
  };
}
