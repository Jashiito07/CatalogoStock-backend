import {
  type AvisoPrivacidad,
  verificarAceptacionPrivacidad,
} from './aviso-privacidad.js';
import {
  PrivacidadDesactualizadaError,
  PrivacidadNoAceptadaError,
} from './errores-autenticacion.js';

const VIGENTE: AvisoPrivacidad = {
  version: '2026-11-1',
  titulo: 'Aviso',
  contenido: 'PROVISIONAL',
  vigenteDesde: new Date('2026-11-05T05:00:00.000Z'),
};

describe('RNF-16 / PA-12 / D-11: aceptación del aviso de privacidad', () => {
  it('acepta la versión vigente', () => {
    expect(() =>
      verificarAceptacionPrivacidad(true, '2026-11-1', VIGENTE),
    ).not.toThrow();
  });

  it('sin aceptar → PRIVACIDAD_NO_ACEPTADA (422)', () => {
    let error: unknown;
    try {
      verificarAceptacionPrivacidad(false, '2026-11-1', VIGENTE);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(PrivacidadNoAceptadaError);
    expect(error).toMatchObject({
      codigo: 'PRIVACIDAD_NO_ACEPTADA',
      categoria: 'REGLA_NEGOCIO',
    });
  });

  it('otra versión → PRIVACIDAD_DESACTUALIZADA con detalles.versionVigente', () => {
    let error: unknown;
    try {
      verificarAceptacionPrivacidad(true, '2025-01-1', VIGENTE);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(PrivacidadDesactualizadaError);
    expect(error).toMatchObject({
      codigo: 'PRIVACIDAD_DESACTUALIZADA',
      detalles: { versionVigente: '2026-11-1' },
    });
  });

  it('sin aceptar tiene prioridad sobre la versión', () => {
    expect(() => verificarAceptacionPrivacidad(false, 'otra', VIGENTE)).toThrow(
      PrivacidadNoAceptadaError,
    );
  });
});
