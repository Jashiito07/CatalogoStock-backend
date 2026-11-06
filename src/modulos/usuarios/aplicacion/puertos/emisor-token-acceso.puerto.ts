import type { Rol } from '../../dominio/rol.js';

/** Identidad que viaja en el token de acceso (`sub` y `rol`, contrato de usuarios). */
export interface IdentidadTokenAcceso {
  idUsuario: string;
  rol: Rol;
}

export interface TokenAccesoEmitido {
  token: string;
  venceEn: Date;
}

/**
 * Puerto del token de acceso (JWT de 15 minutos, D-09).
 * El adaptador usa `@nestjs/jwt` firmado con `JWT_SECRETO`.
 */
export interface EmisorTokenAcceso {
  emitir(
    identidad: IdentidadTokenAcceso,
    ahora: Date,
  ): Promise<TokenAccesoEmitido>;
  /**
   * Comprueba firma y vencimiento. Falla con `TokenAccesoVencidoError`
   * (`TOKEN_VENCIDO`) si venció y con `TokenAccesoAusenteError`
   * (`NO_AUTENTICADO`) si está mal formado o la firma no es válida.
   */
  verificar(token: string): Promise<IdentidadTokenAcceso>;
}

export const EMISOR_TOKEN_ACCESO = Symbol('EMISOR_TOKEN_ACCESO');
