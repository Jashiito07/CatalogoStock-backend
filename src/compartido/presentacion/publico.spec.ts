import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { esRutaPublica, Publico } from './publico.js';

class ControladorMixto {
  @Publico()
  abierta(): void {}

  cerrada(): void {}
}

@Publico()
class ControladorAbierto {
  cualquiera(): void {}
}

function contexto(clase: object, manejador: () => void): ExecutionContext {
  return {
    getHandler: () => manejador,
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

describe('RF-USU-03: @Publico()', () => {
  const reflector = new Reflector();

  it('marca solo la ruta decorada', () => {
    expect(
      esRutaPublica(
        reflector,
        contexto(ControladorMixto, ControladorMixto.prototype.abierta),
      ),
    ).toBe(true);
    expect(
      esRutaPublica(
        reflector,
        contexto(ControladorMixto, ControladorMixto.prototype.cerrada),
      ),
    ).toBe(false);
  });

  it('en el controlador abre todas sus rutas', () => {
    expect(
      esRutaPublica(
        reflector,
        contexto(ControladorAbierto, ControladorAbierto.prototype.cualquiera),
      ),
    ).toBe(true);
  });
});
