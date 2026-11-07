import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NoAutorizadoError } from '../../../../compartido/dominio/errores.js';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import { AuditoriaFalsa } from '../../aplicacion/casos-uso/dobles.prueba-spec.js';
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

const CLIENTE: ActorAutenticado = {
  id: '00000000-0000-4000-8000-0000000000c1',
  rol: 'CLIENTE',
};
const VENDEDOR: ActorAutenticado = {
  id: '00000000-0000-4000-8000-0000000000f1',
  rol: 'VENDEDOR',
};

function contexto(
  clase: object,
  manejador: () => void,
  actor?: ActorAutenticado,
): ExecutionContext {
  const solicitud: Partial<SolicitudAutenticada> = {
    usuarioActual: actor,
    method: 'POST',
    path: '/api/v1/auditoria',
  };
  return {
    switchToHttp: () => ({ getRequest: () => solicitud }),
    getHandler: () => manejador,
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

describe('RF-USU-03 / CA-02: @Roles y GuardRoles', () => {
  const reflector = new Reflector();
  let auditoria: AuditoriaFalsa;
  let guard: GuardRoles;
  const ruta = ControladorFicticio.prototype;

  beforeEach(() => {
    auditoria = new AuditoriaFalsa();
    guard = new GuardRoles(reflector, auditoria);
  });

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
    it('CA-02: Dado un Cliente, cuando invoca una ruta del Vendedor, entonces 403 NO_AUTORIZADO', async () => {
      const ctx = contexto(ControladorFicticio, ruta.soloVendedor, CLIENTE);

      await expect(guard.canActivate(ctx)).rejects.toThrow(NoAutorizadoError);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'No tiene permiso para realizar esta acción.',
      );
    });

    it('D-18: el 403 deja ACCESO_DENEGADO con método, ruta y rol, sin interrumpir y sin entidad', async () => {
      const ctx = contexto(ControladorFicticio, ruta.soloVendedor, CLIENTE);

      await guard.canActivate(ctx).catch(() => undefined);

      expect(auditoria.registradas).toEqual([
        {
          actividad: {
            accion: 'ACCESO_DENEGADO',
            idUsuario: CLIENTE.id,
            entidad: null,
            idEntidad: null,
            detalle: {
              metodo: 'POST',
              ruta: '/api/v1/auditoria',
              rolUsuario: 'CLIENTE',
            },
          },
          enTransaccion: false,
          sinInterrumpir: true,
        },
      ]);
    });

    it('D-18: si la bitácora no está disponible, la respuesta sigue siendo el mismo 403', async () => {
      auditoria.fallo = new Error('bitácora no disponible');

      await expect(
        guard.canActivate(
          contexto(ControladorFicticio, ruta.soloVendedor, CLIENTE),
        ),
      ).rejects.toThrow(NoAutorizadoError);
    });

    it('CA-02: un Cliente tampoco entra a un controlador entero del Vendedor', async () => {
      await expect(
        guard.canActivate(
          contexto(
            ControladorDelVendedor,
            ControladorDelVendedor.prototype.heredada,
            CLIENTE,
          ),
        ),
      ).rejects.toThrow(NoAutorizadoError);
    });

    it('el Vendedor entra a su ruta y no se registra nada', async () => {
      await expect(
        guard.canActivate(
          contexto(ControladorFicticio, ruta.soloVendedor, VENDEDOR),
        ),
      ).resolves.toBe(true);
      expect(auditoria.registradas).toHaveLength(0);
    });

    it('el Vendedor no entra a una ruta solo del Cliente (también se registra)', async () => {
      await expect(
        guard.canActivate(
          contexto(ControladorFicticio, ruta.soloCliente, VENDEDOR),
        ),
      ).rejects.toThrow(NoAutorizadoError);
      expect(auditoria.registradas[0].actividad.detalle).toMatchObject({
        rolUsuario: 'VENDEDOR',
      });
    });

    it('con varios roles, entra cualquiera de ellos', async () => {
      for (const actor of [CLIENTE, VENDEDOR]) {
        await expect(
          guard.canActivate(contexto(ControladorFicticio, ruta.ambos, actor)),
        ).resolves.toBe(true);
      }
    });

    it('sin @Roles, entra cualquier usuario autenticado', async () => {
      for (const actor of [CLIENTE, VENDEDOR]) {
        await expect(
          guard.canActivate(
            contexto(ControladorFicticio, ruta.sinRoles, actor),
          ),
        ).resolves.toBe(true);
      }
    });

    it('una ruta @Publico() no exige rol', async () => {
      await expect(
        guard.canActivate(contexto(ControladorFicticio, ruta.publicaConRoles)),
      ).resolves.toBe(true);
    });

    it('defensa: con @Roles pero sin identidad verificada → 401 NO_AUTENTICADO, nunca anónimo, y no se registra (los 401 no van a la bitácora)', async () => {
      await expect(
        guard.canActivate(contexto(ControladorFicticio, ruta.soloVendedor)),
      ).rejects.toThrow(TokenAccesoAusenteError);
      expect(auditoria.registradas).toHaveLength(0);
    });

    it('defensa: una lista de roles vacía no deja pasar a nadie', async () => {
      for (const actor of [CLIENTE, VENDEDOR]) {
        await expect(
          guard.canActivate(
            contexto(
              ControladorMalConfigurado,
              ControladorMalConfigurado.prototype.vacia,
              actor,
            ),
          ),
        ).rejects.toThrow(NoAutorizadoError);
      }
    });
  });
});
