import {
  esEstadoImportacion,
  Importacion,
  sumarMesesCalendario,
} from './importacion.js';

const ID = '00000000-0000-4000-8000-000000000001';
const MARCA = '00000000-0000-4000-8000-0000000000b1';
const VENDEDOR = '00000000-0000-4000-8000-0000000000aa';
const OTRO_VENDEDOR = '00000000-0000-4000-8000-0000000000ab';

describe('D-60: dueño de la importación', () => {
  it('pertenece solo al Vendedor que la creó', () => {
    const creada = importacion();
    expect(creada.idVendedor).toBe(VENDEDOR);
    expect(creada.perteneceA(VENDEDOR)).toBe(true);
    expect(creada.perteneceA(OTRO_VENDEDOR)).toBe(false);
  });
});

function importacion(): Importacion {
  return Importacion.crear({
    id: ID,
    idVendedor: VENDEDOR,
    nombreArchivo: 'catalogo.pdf',
    huella: 'a'.repeat(64),
    marcaId: MARCA,
    paginas: 3,
    creadaEn: new Date('2026-05-01T08:00:00.000Z'),
  });
}

describe('D-57: meses calendario (6 meses de retención)', () => {
  it.each([
    ['2026-05-17T10:00:00.000Z', '2026-11-17T10:00:00.000Z'],
    ['2026-05-20T10:30:15.250Z', '2026-11-20T10:30:15.250Z'],
    // El mes de destino no tiene ese día: el último del mes (igual que `+ interval '6 months'`).
    ['2026-08-31T12:00:00.000Z', '2027-02-28T12:00:00.000Z'],
    ['2027-08-31T12:00:00.000Z', '2028-02-29T12:00:00.000Z'],
    ['2026-12-15T00:00:00.000Z', '2027-06-15T00:00:00.000Z'],
    ['2026-10-31T23:59:59.999Z', '2027-04-30T23:59:59.999Z'],
  ])('%s + 6 meses → %s', (inicio, esperado) => {
    expect(sumarMesesCalendario(new Date(inicio), 6).toISOString()).toBe(esperado);
  });

  it('no usa 180 días: depende del calendario', () => {
    // 6 meses desde el 1 de enero son 181 días; desde el 1 de julio, 184.
    const enero = sumarMesesCalendario(new Date('2026-01-01T00:00:00.000Z'), 6);
    const julio = sumarMesesCalendario(new Date('2026-07-01T00:00:00.000Z'), 6);
    expect(enero.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(julio.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('D-57: ciclo de vida de una importación', () => {
  it('nace VIGENTE, sin archivadaEn ni eliminaEn, y nunca vence', () => {
    const vigente = importacion();

    expect(vigente.estado).toBe('VIGENTE');
    expect(vigente.estaArchivada).toBe(false);
    expect(vigente.archivadaEn).toBeNull();
    expect(vigente.eliminaEn).toBeNull();
    expect(vigente.estaVencida(new Date('2099-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('archivar guarda archivadaEn y eliminaEn = archivadaEn + 6 meses; la original no cambia', () => {
    const vigente = importacion();
    const archivada = vigente.archivar(new Date('2026-05-20T10:00:00.000Z'));

    expect(archivada.estado).toBe('ARCHIVADA');
    expect(archivada.archivadaEn?.toISOString()).toBe('2026-05-20T10:00:00.000Z');
    expect(archivada.eliminaEn?.toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(vigente.estado).toBe('VIGENTE');
  });

  it('vence a los 6 meses calendario exactos: 5 meses y 29 días no; el instante exacto sí', () => {
    const archivada = importacion().archivar(new Date('2026-05-20T10:00:00.000Z'));

    expect(archivada.estaVencida(new Date('2026-11-19T10:00:00.000Z'))).toBe(false);
    expect(archivada.estaVencida(new Date('2026-11-20T09:59:59.999Z'))).toBe(false);
    expect(archivada.estaVencida(new Date('2026-11-20T10:00:00.000Z'))).toBe(true);
    expect(archivada.estaVencida(new Date('2027-03-01T00:00:00.000Z'))).toBe(true);
  });

  it('esEstadoImportacion solo admite VIGENTE y ARCHIVADA', () => {
    expect(esEstadoImportacion('VIGENTE')).toBe(true);
    expect(esEstadoImportacion('ARCHIVADA')).toBe(true);
    expect(esEstadoImportacion('vigente')).toBe(false);
    expect(esEstadoImportacion(null)).toBe(false);
  });
});
