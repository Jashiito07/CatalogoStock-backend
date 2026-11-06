import { AVISO_PRIVACIDAD_VIGENTE } from './aviso-privacidad.provisional.js';
import { FuenteAvisoPrivacidadEstatica } from './fuente-aviso-privacidad.estatica.js';

describe('RNF-16 / D-15: aviso de privacidad provisional', () => {
  const aviso = new FuenteAvisoPrivacidadEstatica().obtenerVigente();

  it('es el aviso vigente con versión 2026-11-1', () => {
    expect(aviso).toBe(AVISO_PRIVACIDAD_VIGENTE);
    expect(aviso.version).toBe('2026-11-1');
    expect(aviso.vigenteDesde.toISOString()).toBe('2026-11-05T05:00:00.000Z');
  });

  it('D-15: empieza con «PROVISIONAL – revisar antes de publicar»', () => {
    expect(
      aviso.contenido.startsWith('PROVISIONAL – revisar antes de publicar'),
    ).toBe(true);
  });

  it.each([
    ['el responsable', /responsable/i],
    ['los datos recogidos', /nombre, correo electrónico, número de celular/],
    ['los pedidos y comprobantes', /comprobantes/],
    ['con quién se comparten (solo PayPhone)', /salvo con PayPhone/],
    ['la conservación pendiente (PA-12)', /pendiente de definir/],
    ['la LOPDP del Ecuador', /Ley Orgánica de Protección de Datos Personales/],
    [
      'D-20: el correo intentado en ingresos fallidos',
      /guardamos el correo que escribió/,
    ],
  ])('menciona %s', (_tema, patron) => {
    expect(aviso.contenido).toMatch(patron);
  });
});
