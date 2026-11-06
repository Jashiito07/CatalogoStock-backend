import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  EMISOR_TOKEN_ACCESO,
  type EmisorTokenAcceso,
  type IdentidadTokenAcceso,
} from '../../aplicacion/puertos/emisor-token-acceso.puerto.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';

/** Solicitud con la identidad ya verificada por `GuardTokenAcceso`. */
export interface SolicitudAutenticada extends Request {
  usuarioAutenticado?: IdentidadTokenAcceso;
}

/** `Bearer <jwt>`; el esquema no distingue mayúsculas (RFC 7235). */
const CABECERA_BEARER =
  /^Bearer +([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/i;

/**
 * Exige un token de acceso válido en `Authorization: Bearer <tokenAcceso>`.
 * Sin token o con token mal formado o alterado → 401 `NO_AUTENTICADO`;
 * vencido → 401 `TOKEN_VENCIDO` (contrato de usuarios).
 *
 * Subfase 1.3: se aplica solo a `POST /autenticacion/salida` con
 * `@UseGuards(GuardTokenAcceso)`. En la subfase 1.4 pasará a ser el guard
 * global, con `@Publico()` en las rutas abiertas, y se le sumará el guard de
 * roles. Solo comprueba la identidad: los permisos los decide la API, nunca
 * el rol del token por sí solo (RF-USU-03).
 */
@Injectable()
export class GuardTokenAcceso implements CanActivate {
  constructor(
    @Inject(EMISOR_TOKEN_ACCESO)
    private readonly emisor: EmisorTokenAcceso,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const solicitud = contexto
      .switchToHttp()
      .getRequest<SolicitudAutenticada>();
    const coincidencia = CABECERA_BEARER.exec(
      solicitud.headers.authorization ?? '',
    );
    if (!coincidencia) {
      throw new TokenAccesoAusenteError();
    }
    solicitud.usuarioAutenticado = await this.emisor.verificar(coincidencia[1]);
    return true;
  }
}

/** Identidad del usuario autenticado (requiere `GuardTokenAcceso`). */
export const UsuarioAutenticado = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): IdentidadTokenAcceso => {
    const identidad = contexto
      .switchToHttp()
      .getRequest<SolicitudAutenticada>().usuarioAutenticado;
    if (!identidad) {
      // Defensa: la ruta no tiene el guard; nunca se trata como anónima.
      throw new TokenAccesoAusenteError();
    }
    return identidad;
  },
);
