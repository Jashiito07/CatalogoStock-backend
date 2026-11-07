import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import type { SolicitudAutenticada } from './guard-token-acceso.js';
import { extraerUsuarioActual, UsuarioActual } from './usuario-actual.js';

function contexto(actor?: ActorAutenticado): ExecutionContext {
  const solicitud: Partial<SolicitudAutenticada> = { usuarioActual: actor };
  return {
    switchToHttp: () => ({ getRequest: () => solicitud }),
  } as unknown as ExecutionContext;
}

class ControladorFicticio {
  consultar(@UsuarioActual() actor: ActorAutenticado): ActorAutenticado {
    return actor;
  }
}

interface ArgumentoRuta {
  factory: (dato: unknown, contexto: ExecutionContext) => unknown;
}

describe('RF-USU-03: @UsuarioActual()', () => {
  it('entrega { id, rol } verificados por el guard global', () => {
    expect(
      extraerUsuarioActual(contexto({ id: 'cliente-1', rol: 'CLIENTE' })),
    ).toEqual({ id: 'cliente-1', rol: 'CLIENTE' });
  });

  it('sin identidad (ruta pública o sin guard) → 401 NO_AUTENTICADO, nunca anónimo', () => {
    expect(() => extraerUsuarioActual(contexto())).toThrow(
      TokenAccesoAusenteError,
    );
  });

  it('el decorador de parámetro usa la misma extracción', () => {
    const metadatos = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ControladorFicticio,
      'consultar',
    ) as Record<string, ArgumentoRuta>;
    const [argumento] = Object.values(metadatos);

    expect(
      argumento.factory(undefined, contexto({ id: 'v-1', rol: 'VENDEDOR' })),
    ).toEqual({ id: 'v-1', rol: 'VENDEDOR' });
    expect(() => argumento.factory(undefined, contexto())).toThrow(
      TokenAccesoAusenteError,
    );
  });
});
