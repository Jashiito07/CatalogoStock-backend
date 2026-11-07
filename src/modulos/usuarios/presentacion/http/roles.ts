import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { NoAutorizadoError } from '../../../../compartido/dominio/errores.js';
import { esRutaPublica } from '../../../../compartido/presentacion/publico.js';
import {
  SERVICIO_AUDITORIA,
  type ServicioAuditoria,
} from '../../../auditoria/index.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import type { Rol } from '../../dominio/rol.js';
import { extraerUsuarioActual } from './usuario-actual.js';

const CLAVE_ROLES = 'catalogostock:roles-permitidos';

/**
 * Roles que pueden usar la ruta (o todo el controlador; la ruta manda sobre el
 * controlador). Exige al menos un rol. Sin `@Roles`, la ruta queda abierta a
 * cualquier usuario autenticado (Cliente o Vendedor).
 *
 * @example
 * @Roles('VENDEDOR')
 * @Get()
 * listar() { … }
 */
export const Roles = (...roles: [Rol, ...Rol[]]) =>
  SetMetadata(CLAVE_ROLES, roles);

/** Roles exigidos por la ruta, o `undefined` si no declara ninguno. */
export function rolesDeLaRuta(
  reflector: Reflector,
  contexto: ExecutionContext,
): readonly Rol[] | undefined {
  return reflector.getAllAndOverride<readonly Rol[] | undefined>(CLAVE_ROLES, [
    contexto.getHandler(),
    contexto.getClass(),
  ]);
}

/**
 * Guard **global** de roles (RF-USU-03, CA-02). Se ejecuta después de
 * `GuardTokenAcceso`, así que solo llega aquí una identidad ya verificada.
 *
 * El rol sale del JWT firmado por la API (nunca de un dato que envíe la app
 * sin firma). Si no coincide → 403 `NO_AUTORIZADO` antes de llegar al
 * controlador: la solicitud rechazada no modifica ningún dato (CA-02); solo
 * queda su registro `ACCESO_DENEGADO` en la bitácora (D-18).
 */
@Injectable()
export class GuardRoles implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(SERVICIO_AUDITORIA)
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (esRutaPublica(this.reflector, contexto)) {
      return true;
    }
    const permitidos = rolesDeLaRuta(this.reflector, contexto);
    if (permitidos === undefined) {
      return true;
    }
    // Una lista vacía (solo posible saltándose el tipo) no permite a nadie.
    const actor = extraerUsuarioActual(contexto);
    if (!permitidos.includes(actor.rol)) {
      await this.registrarAccesoDenegado(contexto, actor);
      throw new NoAutorizadoError();
    }
    return true;
  }

  /**
   * D-18: el rechazo 403 se registra como `ACCESO_DENEGADO`, fuera de
   * transacción y sin interrumpir (si la bitácora falla, la respuesta sigue
   * siendo el mismo 403). Solo el método, la ruta **sin** parámetros de
   * consulta y el rol; nunca el cuerpo ni las cabeceras. Los 401 no se
   * registran (contrato de usuarios, «Errores comunes»).
   */
  private async registrarAccesoDenegado(
    contexto: ExecutionContext,
    actor: ActorAutenticado,
  ): Promise<void> {
    const solicitud = contexto.switchToHttp().getRequest<Request>();
    await this.auditoria.registrarSinInterrumpir({
      accion: 'ACCESO_DENEGADO',
      idUsuario: actor.id,
      entidad: null,
      idEntidad: null,
      detalle: {
        metodo: solicitud.method,
        // `path` de Express ya no incluye la cadena de consulta (`?…`).
        ruta: solicitud.path,
        rolUsuario: actor.rol,
      },
    });
  }
}
