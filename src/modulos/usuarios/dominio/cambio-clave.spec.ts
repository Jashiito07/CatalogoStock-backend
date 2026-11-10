import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import {
  ClaveActualIncorrectaError,
  ClienteNoEncontradoError,
  CuentaInactivaError,
  exigirClaveNuevaDistinta,
  MENSAJE_CLAVE_NUEVA_IGUAL,
  validarClaveNueva,
  VendedorNoExisteError,
} from './cambio-clave.js';

describe('RF-USU-05: reglas del cambio de clave (dominio)', () => {
  it('la clave nueva sigue las reglas de la clave y el error nombra el campo sin la clave', () => {
    expect(validarClaveNueva('NuevaClave2026')).toBe('NuevaClave2026');
    let error: unknown;
    try {
      validarClaveNueva('debil');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DatosInvalidosError);
    expect(JSON.stringify((error as DatosInvalidosError).detalles)).toContain(
      'claveNueva',
    );
    expect(JSON.stringify(error)).not.toContain('debil');
  });

  it('la clave nueva igual a la actual → 400 con el mensaje del contrato', () => {
    expect(() => exigirClaveNuevaDistinta('Clave2026', 'Clave2026')).toThrow(
      MENSAJE_CLAVE_NUEVA_IGUAL,
    );
    expect(() =>
      exigirClaveNuevaDistinta('Clave2026', 'Otra2026'),
    ).not.toThrow();
  });

  it('códigos de error del contrato', () => {
    expect(new ClaveActualIncorrectaError()).toMatchObject({
      codigo: 'CLAVE_ACTUAL_INCORRECTA',
      message: 'La clave actual no es correcta.',
      categoria: 'REGLA_NEGOCIO',
    });
    expect(new CuentaInactivaError()).toMatchObject({
      codigo: 'CUENTA_INACTIVA',
      categoria: 'REGLA_NEGOCIO',
    });
    expect(new ClienteNoEncontradoError()).toMatchObject({
      codigo: 'NO_ENCONTRADO',
      categoria: 'NO_ENCONTRADO',
    });
    expect(new VendedorNoExisteError().message).toContain(
      'npm run crear-vendedor',
    );
  });
});
