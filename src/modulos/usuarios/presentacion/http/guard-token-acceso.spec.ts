import type { ExecutionContext } from '@nestjs/common';
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

function contextoCon(
  solicitud: Partial<SolicitudAutenticada>,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => solicitud }),
  } as unknown as ExecutionContext;
}

class EmisorFalso implements EmisorTokenAcceso {
  recibido: string | undefined;
  respuesta: Promise<IdentidadTokenAcceso> = Promise.resolve({
    idUsuario: 'id-1',
    rol: 'CLIENTE',
  });

  emitir(): never {
    throw new Error('no se usa');
  }

  verificar(token: string): Promise<IdentidadTokenAcceso> {
    this.recibido = token;
    return this.respuesta;
  }
}

describe('RF-USU-01: GuardTokenAcceso (Authorization: Bearer)', () => {
  it('con un token válido deja pasar y guarda la identidad en la solicitud', async () => {
    const emisor = new EmisorFalso();
    const solicitud = { headers: { authorization: `Bearer ${JWT_FALSO}` } };

    await expect(
      new GuardTokenAcceso(emisor).canActivate(contextoCon(solicitud)),
    ).resolves.toBe(true);
    expect(emisor.recibido).toBe(JWT_FALSO);
    expect((solicitud as SolicitudAutenticada).usuarioAutenticado).toEqual({
      idUsuario: 'id-1',
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
        new GuardTokenAcceso(emisor).canActivate(
          contextoCon({ headers: { authorization: cabecera } }),
        ),
      ).rejects.toBeInstanceOf(TokenAccesoAusenteError);
      expect(emisor.recibido).toBeUndefined();
    },
  );

  it('propaga TOKEN_VENCIDO del emisor', async () => {
    const emisor = new EmisorFalso();
    emisor.respuesta = Promise.reject(new TokenAccesoVencidoError());

    await expect(
      new GuardTokenAcceso(emisor).canActivate(
        contextoCon({ headers: { authorization: `bearer ${JWT_FALSO}` } }),
      ),
    ).rejects.toMatchObject({ codigo: 'TOKEN_VENCIDO' });
  });
});
