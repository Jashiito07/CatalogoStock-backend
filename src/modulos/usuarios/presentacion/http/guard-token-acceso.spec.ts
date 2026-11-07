import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import type {
  EmisorTokenAcceso,
  IdentidadTokenAcceso,
} from '../../aplicacion/puertos/emisor-token-acceso.puerto.js';
import {
  TokenAccesoAusenteError,
  TokenAccesoVencidoError,
} from '../../dominio/errores-autenticacion.js';
import {
  GuardTokenAcceso,
  type SolicitudAutenticada,
} from './guard-token-acceso.js';

const JWT_FALSO = 'aaa.bbb.ccc';

class ControladorFicticio {
  protegida(): void {}

  @Publico()
  publica(): void {}
}

@Publico()
class ControladorPublicoFicticio {
  cualquiera(): void {}
}

function contextoCon(
  solicitud: Partial<SolicitudAutenticada>,
  clase: object = ControladorFicticio,
  manejador: () => void = ControladorFicticio.prototype.protegida,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => solicitud }),
    getHandler: () => manejador,
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

class EmisorFalso implements EmisorTokenAcceso {
  recibido: string | undefined;
  /** Si se define, `verificar` falla con este error (se crea al llamar). */
  error: Error | undefined;

  emitir(): never {
    throw new Error('no se usa');
  }

  verificar(token: string): Promise<IdentidadTokenAcceso> {
    this.recibido = token;
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve({ idUsuario: 'id-1', rol: 'CLIENTE' });
  }
}

describe('RF-USU-03 / CA-02: GuardTokenAcceso global (Authorization: Bearer)', () => {
  const reflector = new Reflector();
  const crearGuard = (emisor: EmisorTokenAcceso) =>
    new GuardTokenAcceso(emisor, reflector);

  it('con un token válido deja pasar y guarda { id, rol } en la solicitud', async () => {
    const emisor = new EmisorFalso();
    const solicitud = { headers: { authorization: `Bearer ${JWT_FALSO}` } };

    await expect(
      crearGuard(emisor).canActivate(contextoCon(solicitud)),
    ).resolves.toBe(true);
    expect(emisor.recibido).toBe(JWT_FALSO);
    expect((solicitud as SolicitudAutenticada).usuarioActual).toEqual({
      id: 'id-1',
      rol: 'CLIENTE',
    });
  });

  it.each([
    undefined,
    '',
    'Basic abc',
    `Bearer`,
    'Bearer no-es-jwt',
    `Token ${JWT_FALSO}`,
  ])(
    'sin un Bearer bien formado (%s) → NO_AUTENTICADO sin verificar nada',
    async (cabecera) => {
      const emisor = new EmisorFalso();

      await expect(
        crearGuard(emisor).canActivate(
          contextoCon({ headers: { authorization: cabecera } }),
        ),
      ).rejects.toBeInstanceOf(TokenAccesoAusenteError);
      expect(emisor.recibido).toBeUndefined();
    },
  );

  it('propaga TOKEN_VENCIDO del emisor y no guarda identidad', async () => {
    const emisor = new EmisorFalso();
    emisor.error = new TokenAccesoVencidoError();
    const solicitud: Partial<SolicitudAutenticada> = {
      headers: { authorization: `bearer ${JWT_FALSO}` },
    };

    await expect(
      crearGuard(emisor).canActivate(contextoCon(solicitud)),
    ).rejects.toMatchObject({ codigo: 'TOKEN_VENCIDO' });
    expect(solicitud.usuarioActual).toBeUndefined();
  });

  describe('@Publico()', () => {
    it('una ruta pública pasa sin token y sin verificar nada', async () => {
      const emisor = new EmisorFalso();
      const solicitud: Partial<SolicitudAutenticada> = { headers: {} };

      await expect(
        crearGuard(emisor).canActivate(
          contextoCon(
            solicitud,
            ControladorFicticio,
            ControladorFicticio.prototype.publica,
          ),
        ),
      ).resolves.toBe(true);
      expect(emisor.recibido).toBeUndefined();
      expect(solicitud.usuarioActual).toBeUndefined();
    });

    it('una ruta pública ignora un token, aunque sea inválido', async () => {
      const emisor = new EmisorFalso();
      emisor.error = new TokenAccesoAusenteError();

      await expect(
        crearGuard(emisor).canActivate(
          contextoCon(
            { headers: { authorization: `Bearer ${JWT_FALSO}` } },
            ControladorFicticio,
            ControladorFicticio.prototype.publica,
          ),
        ),
      ).resolves.toBe(true);
      expect(emisor.recibido).toBeUndefined();
    });

    it('@Publico() en el controlador abre todas sus rutas', async () => {
      await expect(
        crearGuard(new EmisorFalso()).canActivate(
          contextoCon(
            { headers: {} },
            ControladorPublicoFicticio,
            ControladorPublicoFicticio.prototype.cualquiera,
          ),
        ),
      ).resolves.toBe(true);
    });

    it('una ruta sin @Publico() en un controlador sin @Publico() exige token', async () => {
      await expect(
        crearGuard(new EmisorFalso()).canActivate(contextoCon({ headers: {} })),
      ).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    });
  });
});
