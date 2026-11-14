import { Marca } from './marca.js';
import { MARCAS_SUGERIDAS } from './marcas-sugeridas.js';

const DATOS_INVALIDOS = expect.objectContaining({ codigo: 'DATOS_INVALIDOS' });

const AHORA = new Date('2026-11-11T15:00:00.000Z');
const DESPUES = new Date('2026-11-11T16:00:00.000Z');
const ID = '00000000-0000-4000-8000-000000000001';

function crear(
  parcial: Partial<Parameters<typeof Marca.crear>[0]> = {},
): Marca {
  return Marca.crear({
    id: ID,
    nombre: 'Yanbal',
    color: '#fc5823',
    orden: 0,
    ahora: AHORA,
    ...parcial,
  });
}

describe('RF-PRO-04 / RNF-11: Marca', () => {
  it('se crea activa, con el color en mayúsculas y el texto calculado', () => {
    const marca = crear();
    expect(marca.aPublica()).toEqual({
      id: ID,
      nombre: 'Yanbal',
      color: '#FC5823',
      colorAcento: null,
      textoSobreColor: '#1E293B',
      textoSobreAcento: null,
      activa: true,
      orden: 0,
      creadaEn: AHORA,
    });
  });

  it('calcula el texto del acento (Leonisa: base oscura, acento naranja)', () => {
    const marca = crear({
      nombre: 'Leonisa',
      color: '#222221',
      colorAcento: '#f36e21',
    });
    expect(marca.colorAcento).toBe('#F36E21');
    expect(marca.textoSobreColor).toBe('#FFFFFF');
    expect(marca.textoSobreAcento).toBe('#1E293B');
  });

  it('todas las marcas sugeridas cumplen 4.5:1 y son válidas', () => {
    expect(MARCAS_SUGERIDAS.map((m) => m.nombre)).toEqual([
      'Yanbal',
      'Avon',
      "L'Bel",
      'Cyzone',
      'Esika',
      'Leonisa',
    ]);
    for (const sugerida of MARCAS_SUGERIDAS) {
      const marca = crear(sugerida);
      expect(marca.textoSobreColor).toBeDefined();
    }
  });

  it.each([-1, 1.5, Number.NaN, '3', null, 2_147_483_648])(
    'rechaza el orden %j',
    (orden) => {
      expect(() => crear({ orden })).toThrowError(
        expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
      );
    },
  );

  it('rechaza colores y nombres inválidos', () => {
    expect(() => crear({ color: 'rojo' })).toThrowError(DATOS_INVALIDOS);
    expect(() => crear({ colorAcento: '#12345' })).toThrowError(
      DATOS_INVALIDOS,
    );
    expect(() => crear({ nombre: 'X' })).toThrowError(DATOS_INVALIDOS);
  });

  describe('aplicar cambios parciales', () => {
    it('devuelve solo los campos que de verdad cambiaron', () => {
      const marca = crear();
      const { marca: nueva, campos } = marca.aplicar(
        { color: '#FC5823', activa: false, orden: 3 },
        DESPUES,
      );
      expect(campos).toEqual(['activa', 'orden']);
      expect(nueva.activa).toBe(false);
      expect(nueva.orden).toBe(3);
      expect(nueva.actualizadaEn).toEqual(DESPUES);
      // La marca original no cambia (inmutable).
      expect(marca.activa).toBe(true);
    });

    it('sin cambios devuelve la misma marca', () => {
      const marca = crear();
      const resultado = marca.aplicar({}, DESPUES);
      expect(resultado.marca).toBe(marca);
      expect(resultado.campos).toEqual([]);
    });

    it('colorAcento null quita el acento; un valor lo pone', () => {
      const conAcento = crear({ colorAcento: '#F36E21' });
      const sin = conAcento.aplicar({ colorAcento: null }, DESPUES);
      expect(sin.marca.colorAcento).toBeNull();
      expect(sin.marca.textoSobreAcento).toBeNull();
      expect(sin.campos).toEqual(['colorAcento']);
      const con = sin.marca.aplicar({ colorAcento: '#222221' }, DESPUES);
      expect(con.marca.colorAcento).toBe('#222221');
    });

    it('un cambio solo de mayúsculas en el nombre cuenta como cambio', () => {
      const { marca, campos } = crear().aplicar({ nombre: 'YANBAL' }, DESPUES);
      expect(marca.nombre.valor).toBe('YANBAL');
      expect(campos).toEqual(['nombre']);
    });

    it('valida cada campo: nombre, color, activa, orden', () => {
      const marca = crear();
      expect(() => marca.aplicar({ nombre: 'a' }, DESPUES)).toThrowError(
        DATOS_INVALIDOS,
      );
      expect(() => marca.aplicar({ color: null }, DESPUES)).toThrowError(
        DATOS_INVALIDOS,
      );
      expect(() => marca.aplicar({ colorAcento: 'x' }, DESPUES)).toThrowError(
        DATOS_INVALIDOS,
      );
      expect(() => marca.aplicar({ activa: 'si' }, DESPUES)).toThrowError(
        DATOS_INVALIDOS,
      );
      expect(() => marca.aplicar({ orden: -1 }, DESPUES)).toThrowError(
        DATOS_INVALIDOS,
      );
    });
  });
});
