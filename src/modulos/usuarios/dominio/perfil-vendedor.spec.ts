import { PerfilVendedor, PROVINCIAS_ECUADOR } from './perfil-vendedor.js';

const AHORA = new Date('2026-11-18T15:00:00.000Z');
const ID = '6f1c0000-0000-4000-8000-0000000000aa';

const valido = {
  nombreComercial: '  Belleza  de   Ana ',
  ciudad: 'Portoviejo',
  provincia: 'manabi',
  whatsapp: '0991234567',
};

describe('RF-USU-08: perfil comercial del Vendedor (dominio)', () => {
  it('hay exactamente 24 provincias sin repetir', () => {
    expect(PROVINCIAS_ECUADOR).toHaveLength(24);
    expect(new Set(PROVINCIAS_ECUADOR).size).toBe(24);
  });

  it('normaliza el nombre, la provincia (sin tildes ni mayúsculas) y el WhatsApp a E.164', () => {
    const perfil = PerfilVendedor.crear(ID, valido, AHORA);
    expect(perfil.nombreComercial).toBe('Belleza de Ana');
    expect(perfil.provincia).toBe('Manabí');
    expect(perfil.whatsapp).toBe('+593991234567');
  });

  it.each([
    ['nombreComercial', 'A'],
    ['nombreComercial', 'x'.repeat(81)],
    ['ciudad', ''],
    ['ciudad', 'y'.repeat(61)],
    ['provincia', 'Texas'],
    ['whatsapp', '022345678'],
    ['whatsapp', '+34600000000'],
  ])('rechaza %s inválido con un error de ese campo', (campo, valor) => {
    expect(() =>
      PerfilVendedor.crear(ID, { ...valido, [campo]: valor }, AHORA),
    ).toThrowError(
      expect.objectContaining({
        codigo: 'DATOS_INVALIDOS',
        detalles: { errores: [expect.objectContaining({ campo })] },
      }),
    );
  });

  it('camposCambiados lista solo los nombres: todos al crear y solo los distintos al actualizar', () => {
    const primero = PerfilVendedor.crear(ID, valido, AHORA);
    expect(primero.camposCambiados(null)).toEqual([
      'nombreComercial',
      'ciudad',
      'provincia',
      'whatsapp',
    ]);
    const segundo = PerfilVendedor.crear(
      ID,
      { ...valido, ciudad: 'Manta' },
      AHORA,
    );
    expect(segundo.camposCambiados(primero)).toEqual(['ciudad']);
    expect(primero.camposCambiados(primero)).toEqual([]);
  });
});
