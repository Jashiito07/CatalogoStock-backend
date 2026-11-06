import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type {
  EmisorTokenAcceso,
  IdentidadTokenAcceso,
  TokenAccesoEmitido,
} from '../../aplicacion/puertos/emisor-token-acceso.puerto.js';
import {
  TokenAccesoAusenteError,
  TokenAccesoVencidoError,
} from '../../dominio/errores-autenticacion.js';
import { esRol } from '../../dominio/rol.js';

/** Único algoritmo aceptado: evita tokens `alg: none` o con otro algoritmo. */
export const ALGORITMO_JWT = 'HS256';

/** Contenido del JWT de acceso (contrato de usuarios): `sub`, `rol`, `iat`, `exp`. */
interface ContenidoJwt {
  sub?: unknown;
  rol?: unknown;
}

/**
 * Adaptador `@nestjs/jwt` del puerto EmisorTokenAcceso (D-08, D-09).
 * El secreto (`JWT_SECRETO`) y el algoritmo se configuran en `JwtModule`.
 */
export class EmisorTokenAccesoJwt implements EmisorTokenAcceso {
  constructor(
    private readonly jwt: JwtService,
    private readonly vidaSegundos: number,
  ) {}

  async emitir(
    identidad: IdentidadTokenAcceso,
    ahora: Date,
  ): Promise<TokenAccesoEmitido> {
    // `iat` explícito: `exp` se calcula desde el reloj inyectado, igual que
    // `venceAccesoEn`, y ambos coinciden siempre.
    const iat = Math.floor(ahora.getTime() / 1000);
    const token = await this.jwt.signAsync(
      { sub: identidad.idUsuario, rol: identidad.rol, iat },
      { expiresIn: this.vidaSegundos, algorithm: ALGORITMO_JWT },
    );
    return { token, venceEn: new Date((iat + this.vidaSegundos) * 1000) };
  }

  async verificar(token: string): Promise<IdentidadTokenAcceso> {
    let contenido: ContenidoJwt;
    try {
      contenido = await this.jwt.verifyAsync<ContenidoJwt>(token, {
        algorithms: [ALGORITMO_JWT],
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new TokenAccesoVencidoError();
      }
      throw new TokenAccesoAusenteError();
    }
    if (
      typeof contenido.sub !== 'string' ||
      contenido.sub.length === 0 ||
      !esRol(contenido.rol)
    ) {
      throw new TokenAccesoAusenteError();
    }
    return { idUsuario: contenido.sub, rol: contenido.rol };
  }
}
