import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { esRutaPublica } from '../../../../compartido/presentacion/publico.js';
import {
  EMISOR_TOKEN_ACCESO,
  type EmisorTokenAcceso,
} from '../../aplicacion/puertos/emisor-token-acceso.puerto.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';

/** Solicitud con la identidad ya verificada por `GuardTokenAcceso`. */
export interface SolicitudAutenticada extends Request {
  usuarioActual?: ActorAutenticado;
}

/** `Bearer <jwt>`; el esquema no distingue mayúsculas (RFC 7235). */
const CABECERA_BEARER =
  /^Bearer +([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/i;

/**
 * Guard **global** de autenticación (RF-USU-03, CA-02, subfase 1.4).
 *
 * Toda ruta exige `Authorization: Bearer <tokenAcceso>` salvo las marcadas con
 * `@Publico()`. Sin token, mal formado, con firma inválida u otro algoritmo →
 * 401 `NO_AUTENTICADO`; vencido → 401 `TOKEN_VENCIDO` (contrato de usuarios).
 *
 * Solo comprueba la identidad (firma y vencimiento del JWT). Los permisos los
 * decide `GuardRoles` y la propiedad, el caso de uso. Se registra como
 * `APP_GUARD` en `ProteccionRutasModule`, **después** del límite de intentos
 * (D-17) y **antes** del guard de roles.
 */
@Injectable()
export class GuardTokenAcceso implements CanActivate {
  constructor(
    @Inject(EMISOR_TOKEN_ACCESO)
    private readonly emisor: EmisorTokenAcceso,
    @Inject(Reflector)
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (esRutaPublica(this.reflector, contexto)) {
      return true;
    }
    const solicitud = contexto
      .switchToHttp()
      .getRequest<SolicitudAutenticada>();
    const coincidencia = CABECERA_BEARER.exec(
      solicitud.headers.authorization ?? '',
    );
    if (!coincidencia) {
      throw new TokenAccesoAusenteError();
    }
    const identidad = await this.emisor.verificar(coincidencia[1]);
    solicitud.usuarioActual = { id: identidad.idUsuario, rol: identidad.rol };
    return true;
  }
}
