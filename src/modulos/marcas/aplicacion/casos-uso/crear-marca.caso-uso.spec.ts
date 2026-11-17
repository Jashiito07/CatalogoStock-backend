import { MARCAS_SUGERIDAS } from '../../dominio/marcas-sugeridas.js';
import { CrearMarcaCasoUso } from './crear-marca.caso-uso.js';
import {
  AuditoriaFalsa,
  generadorIdSecuencial,
  ID_VENDEDOR,
  MarcaRepositorioEnMemoria,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';

describe('RF-PRO-04 / RF-PRO-06: CrearMarcaCasoUso', () => {
  let marcas: MarcaRepositorioEnMemoria;
  let unidad: UnidadDeTrabajoFalsa;
  let auditoria: AuditoriaFalsa;
  let caso: CrearMarcaCasoUso;

  beforeEach(() => {
    marcas = new MarcaRepositorioEnMemoria();
    unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    caso = new CrearMarcaCasoUso(
      marcas,
      generadorIdSecuencial(),
      new RelojFalso(),
      unidad,
      auditoria,
    );
  });

  const crear = (datos: Record<string, unknown>) =>
    caso.ejecutar({
      idVendedor: ID_VENDEDOR,
      nombre: 'Yanbal',
      color: '#FC5823',
      ...datos,
    });

  it('Dado un nombre y un color, Cuando el Vendedor crea la marca, Entonces queda activa con el texto calculado', async () => {
    const marca = await crear({});
    expect(marca).toMatchObject({
      nombre: 'Yanbal',
      color: '#FC5823',
      colorAcento: null,
      textoSobreColor: '#1E293B',
      textoSobreAcento: null,
      activa: true,
      orden: 0,
    });
    expect(marcas.marcas).toHaveLength(1);
  });

  it('registra MARCA_CREADA con el nombre, en la misma transacción', async () => {
    const marca = await crear({});
    expect(auditoria.registradas).toEqual([
      {
        actividad: {
          accion: 'MARCA_CREADA',
          idUsuario: ID_VENDEDOR,
          entidad: 'MARCA',
          idEntidad: marca.id,
          detalle: { nombre: 'Yanbal' },
        },
        enTransaccion: true,
      },
    ]);
  });

  it('el orden por defecto es al final y se puede indicar uno', async () => {
    const primera = await crear({ nombre: 'Avon' });
    const segunda = await crear({ nombre: 'Esika' });
    const tercera = await crear({ nombre: 'Cyzone', orden: 10 });
    const cuarta = await crear({ nombre: 'Leonisa' });
    expect([primera.orden, segunda.orden, tercera.orden, cuarta.orden]).toEqual(
      [0, 1, 10, 11],
    );
  });

  it.each(['Yanbal', 'YANBAL', 'yanbal ', '  Yanbal  '])(
    'RF-PRO-04: el nombre repetido «%s» → MARCA_DUPLICADA y no queda nada nuevo',
    async (repetido) => {
      await crear({});
      auditoria.registradas.length = 0;
      await expect(crear({ nombre: repetido })).rejects.toMatchObject({
        codigo: 'MARCA_DUPLICADA',
        categoria: 'CONFLICTO',
      });
      expect(marcas.marcas).toHaveLength(1);
      expect(auditoria.registradas).toHaveLength(0);
    },
  );

  it('el nombre repetido con otras tildes también es duplicado', async () => {
    await crear({ nombre: 'Ésika' });
    await expect(crear({ nombre: 'esika' })).rejects.toMatchObject({
      codigo: 'MARCA_DUPLICADA',
    });
  });

  it('una marca inactiva también bloquea su nombre', async () => {
    await crear({});
    marcas.marcas[0] = marcas.marcas[0].aplicar(
      { activa: false },
      new Date(),
    ).marca;
    await expect(crear({})).rejects.toMatchObject({
      codigo: 'MARCA_DUPLICADA',
    });
  });

  it('RNF-03: datos inválidos → DATOS_INVALIDOS y nada se guarda ni se registra', async () => {
    for (const malo of [
      { nombre: 'a' },
      { nombre: 'Mi Tienda', color: 'rojo' },
      { nombre: 'Mi Tienda', colorAcento: '#ZZZZZZ' },
      { orden: -2 },
    ]) {
      await expect(crear(malo)).rejects.toMatchObject({
        codigo: 'DATOS_INVALIDOS',
      });
    }
    expect(marcas.marcas).toHaveLength(0);
    expect(auditoria.registradas).toHaveLength(0);
  });

  describe('D-56: marcas conocidas y colores fijos', () => {
    it.each([
      ['Avon', 'Avon'],
      ['AVON', 'Avon'],
      ['  avon ', 'Avon'],
      ["L'Bel", "L'Bel"],
      ['L´Bel', "L'Bel"],
      ['lbel', "L'Bel"],
      ['Ésika', 'Esika'],
      ['ESIKA', 'Esika'],
    ])(
      'el nombre «%s» se guarda como «%s» con los colores oficiales',
      async (escrito, oficial) => {
        const marca = await crear({
          nombre: escrito,
          color: '#000000',
          colorAcento: '#FFFFFF',
        });
        const sugerida = MARCAS_SUGERIDAS.find((m) => m.nombre === oficial);
        expect(marca).toMatchObject({
          nombre: oficial,
          color: sugerida?.color,
          colorAcento: sugerida?.colorAcento,
        });
      },
    );

    it('ignora los colores enviados, incluso inválidos o ausentes', async () => {
      const a = await crear({ nombre: 'Avon', color: 'no es color' });
      expect(a.color).toBe('#FF2469');
      const e = await crear({ nombre: 'Esika', color: undefined });
      expect(e.color).toBe('#E1251B');
    });

    it('Leonisa recibe su acento oficial y el texto calculado de ambos', async () => {
      const marca = await crear({ nombre: 'leonisa', color: '#FFFFFF' });
      expect(marca).toMatchObject({
        nombre: 'Leonisa',
        color: '#222221',
        colorAcento: '#F36E21',
        textoSobreColor: '#FFFFFF',
        textoSobreAcento: '#1E293B',
      });
    });

    it('una variante de una conocida ya creada → MARCA_DUPLICADA', async () => {
      await crear({ nombre: "L'Bel" });
      await expect(crear({ nombre: 'lbel' })).rejects.toMatchObject({
        codigo: 'MARCA_DUPLICADA',
      });
      expect(marcas.marcas).toHaveLength(1);
    });

    it('una marca propia conserva sus colores libres', async () => {
      const marca = await crear({
        nombre: 'Mi Tienda',
        color: '#123456',
        colorAcento: '#abcdef',
      });
      expect(marca).toMatchObject({
        color: '#123456',
        colorAcento: '#ABCDEF',
      });
    });

    it('el nombre sigue validándose (2 a 40 caracteres) aunque sea conocido', async () => {
      await expect(crear({ nombre: 'A' })).rejects.toMatchObject({
        codigo: 'DATOS_INVALIDOS',
      });
    });

    it('MARCA_CREADA registra solo el nombre oficial, sin colores', async () => {
      const marca = await crear({ nombre: 'ÉSIKA', color: '#000000' });
      expect(auditoria.registradas[0].actividad.detalle).toEqual({
        nombre: 'Esika',
      });
      expect(marca.nombre).toBe('Esika');
    });
  });

  it('CA-03: si la bitácora falla, el error se propaga (la transacción real deshace la marca)', async () => {
    auditoria.fallo = new Error('bitácora caída');
    await expect(crear({})).rejects.toThrow('bitácora caída');
  });
});
