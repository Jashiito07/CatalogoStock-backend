import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NoAutorizadoError } from '../../../../compartido/dominio/errores.js';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import type { Rol } from '../../dominio/rol.js';
import type { SolicitudAutenticada } from './guard-token-acceso.js';
import { GuardRoles, Roles, rolesDeLaRuta } from './roles.js';

class ControladorFicticio {
  @Roles('VENDEDOR')
  soloVendedor(): void {}

  @Roles('CLIENTE')
  soloCliente(): void {}

  @Roles('CLIENTE', 'VENDEDOR')
  ambos(): void {}

  sinRoles(): void {}

  @Publico()
  @Roles('VENDEDOR')
  publicaConRoles(): void {}
}

@Roles('VENDEDOR')
class ControladorDelVendedor {
  heredada(): void {}

  @Roles('CLIENTE')
  sobrescrita(): void {}
}

/** Fuerza una lista vacía, que el tipo de `@Roles` no permite. */
const RolesVacios = Roles as unknown as (...roles: Rol[]) => MethodDecorator;

class ControladorMalConfigurado {
  @RolesVacios()
  vacia(): void {}
}

const CLIENTE: ActorAutenticado = { id: 'cliente-1', rol: 'CLIENTE' };
const VENDEDOR: ActorAutenticado = { id: 'vendedor-1', rol: 'VENDEDOR' };

function contexto(
  clase: object,
  manejador: () => void,
  actor?: ActorAutenticado,
): ExecutionContext {
  const solicitud: Partial<SolicitudAutenticada> = { usuarioActual: actor };
  return {
    switchToHttp: () => ({ getRequest: () => solicitud }),
    getHandler: () => manejador,
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

describe('RF-USU-03 / CA-02: @Roles y GuardRoles', () => {
  const reflector = new Reflector();
  const guard = new GuardRoles(reflector);
  const ruta = ControladorFicticio.prototype;

  describe('@Roles', () => {
    it('guarda los roles de la ruta; la ruta manda sobre el controlador', () => {
      expect(
        rolesDeLaRuta(reflector, contexto(ControladorFicticio, ruta.ambos)),
      ).toEqual(['CLIENTE', 'VENDEDOR']);
      expect(
        rolesDeLaRuta(
          reflector,
          contexto(
            ControladorDelVendedor,
            ControladorDelVendedor.prototype.heredada,
          ),
        ),
      ).toEqual(['VENDEDOR']);
      expect(
        rolesDeLaRuta(
          reflector,
          contexto(
            ControladorDelVendedor,
            ControladorDelVendedor.prototype.sobrescrita,
          ),
        ),
      ).toEqual(['CLIENTE']);
      expect(
        rolesDeLaRuta(reflector, contexto(ControladorFicticio, ruta.sinRoles)),
      ).toBeUndefined();
    });
  });

  describe('GuardRoles', () => {
    it('CA-02: Dado un Cliente, cuando invoca una ruta del Vendedor, entonces 403 NO_AUTORIZADO', () => {
      const ctx = contexto(ControladorFicticio, ruta.soloVendedor, CLIENTE);

      expect(() => guard.canActivate(ctx)).toThrow(NoAutorizadoError);
      expect(() => guard.canActivate(ctx)).toThrow(
        'No tiene permiso para realizar esta acción.',
      );
    });

    it('CA-02: un Cliente tampoco entra a un controlador entero del Vendedor', () => {
      expect(() =>
        guard.canActivate(
          contexto(
            ControladorDelVendedor,
            ControladorDelVendedor.prototype.heredada,
            CLIENTE,
          ),
        ),
      ).toThrow(NoAutorizadoError);
    });

    it('el Vendedor entra a su ruta', () => {
      expect(
        guard.canActivate(
          contexto(ControladorFicticio, ruta.soloVendedor, VENDEDOR),
        ),
      ).toBe(true);
    });

    it('el Vendedor no entra a una ruta solo del Cliente', () => {
      expect(() =>
        guard.canActivate(
          contexto(ControladorFicticio, ruta.soloCliente, VENDEDOR),
        ),
      ).toThrow(NoAutorizadoError);
    });

    it('con varios roles, entra cualquiera de ellos', () => {
      for (const actor of [CLIENTE, VENDEDOR]) {
        expect(
          guard.canActivate(contexto(ControladorFicticio, ruta.ambos, actor)),
        ).toBe(true);
      }
    });

    it('sin @Roles, entra cualquier usuario autenticado', () => {
      for (const actor of [CLIENTE, VENDEDOR]) {
        expect(
          guard.canActivate(
            contexto(ControladorFicticio, ruta.sinRoles, actor),
          ),
        ).toBe(true);
      }
    });

    it('una ruta @Publico() no exige rol', () => {
      expect(
        guard.canActivate(contexto(ControladorFicticio, ruta.publicaConRoles)),
      ).toBe(true);
    });

    it('defensa: con @Roles pero sin identidad verificada → 401 NO_AUTENTICADO, nunca anónimo', () => {
      expect(() =>
        guard.canActivate(contexto(ControladorFicticio, ruta.soloVendedor)),
      ).toThrow(TokenAccesoAusenteError);
    });

    it('defensa: una lista de roles vacía no deja pasar a nadie', () => {
      for (const actor of [CLIENTE, VENDEDOR]) {
        expect(() =>
          guard.canActivate(
            contexto(
              ControladorMalConfigurado,
              ControladorMalConfigurado.prototype.vacia,
              actor,
            ),
          ),
        ).toThrow(NoAutorizadoError);
      }
    });
  });
});
