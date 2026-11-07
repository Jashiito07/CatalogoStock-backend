import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NoAutorizadoError } from '../../../../compartido/dominio/errores.js';
import { esRutaPublica } from '../../../../compartido/presentacion/publico.js';
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
 * controlador: la solicitud rechazada no modifica ningún dato (CA-02).
 */
@Injectable()
export class GuardRoles implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
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
      // PENDIENTE (subfase 1.5): registrar `ACCESO_DENEGADO` en la bitácora
      // (D-18) fuera de transacción, con `idUsuario: actor.id`, entidad `null`
      // y detalle `{ metodo, ruta (sin parámetros de consulta), rolUsuario }`.
      throw new NoAutorizadoError();
    }
    return true;
  }
}
