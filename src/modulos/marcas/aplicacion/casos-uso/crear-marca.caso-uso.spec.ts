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
      { color: 'rojo' },
      { colorAcento: '#ZZZZZZ' },
      { orden: -2 },
    ]) {
      await expect(crear(malo)).rejects.toMatchObject({
        codigo: 'DATOS_INVALIDOS',
      });
    }
    expect(marcas.marcas).toHaveLength(0);
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('CA-03: si la bitácora falla, el error se propaga (la transacción real deshace la marca)', async () => {
    auditoria.fallo = new Error('bitácora caída');
    await expect(crear({})).rejects.toThrow('bitácora caída');
  });
});
