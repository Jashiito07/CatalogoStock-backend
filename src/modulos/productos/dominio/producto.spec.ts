import { Dinero } from '../../../compartido/dominio/dinero.js';
import { claveDeBusqueda, validarBusqueda } from './busqueda.js';
import { DISPONIBILIDADES, validarDisponibilidad } from './disponibilidad.js';
import { Producto, validarPrecio } from './producto.js';

const DATOS_INVALIDOS = expect.objectContaining({ codigo: 'DATOS_INVALIDOS' });

const AHORA = new Date('2026-11-11T15:00:00.000Z');
const DESPUES = new Date('2026-11-11T16:00:00.000Z');
const ID = '00000000-0000-4000-8000-000000000001';
const MARCA = '00000000-0000-4000-8000-0000000000b1';

function crear(
  parcial: Partial<Parameters<typeof Producto.crear>[0]> = {},
): Producto {
  return Producto.crear({
    id: ID,
    nombre: 'Crema hidratante Ésika 50 g',
    marcaId: MARCA,
    precio: '12.50',
    ahora: AHORA,
    ...parcial,
  });
}

describe('RF-PRO-01 / RNF-03 / RN-11: precio exacto', () => {
  it.each(['12.5', '12.50', '99999.99', '0.01', '1', '00012.5'])(
    'acepta «%s»',
    (precio) => {
      expect(validarPrecio(precio)).toBeInstanceOf(Dinero);
    },
  );

  it.each([
    '0.00',
    '0',
    '12.505',
    '-1',
    '100000.00',
    '123456',
    '',
    ' 12.50',
    '12,50',
    '1e2',
    '12.',
    '.5',
    12.5,
    0,
    null,
    undefined,
    {},
  ])('rechaza %j', (precio) => {
    expect(() => validarPrecio(precio)).toThrowError(DATOS_INVALIDOS);
  });

  it('el precio se expone como texto con 2 decimales, sin error de punto flotante', () => {
    expect(crear({ precio: '12.5' }).precio.aTexto()).toBe('12.50');
    expect(crear({ precio: '0.1' }).precio.aTexto()).toBe('0.10');
    expect(crear({ precio: '99999.99' }).precio.aTexto()).toBe('99999.99');
  });
});

describe('RF-PRO-01 / RF-PRO-05: Producto', () => {
  it('se crea con nombre recortado, descripción vacía y DISPONIBLE por defecto', () => {
    const producto = crear({ nombre: '  Crema   hidratante ' });
    expect(producto.aPublico()).toEqual({
      id: ID,
      nombre: 'Crema hidratante',
      marcaId: MARCA,
      precio: Dinero.desdeTexto('12.50'),
      descripcion: '',
      disponibilidad: 'DISPONIBLE',
      creadoEn: AHORA,
      actualizadoEn: AHORA,
    });
  });

  it('calcula las claves de búsqueda sin tildes ni mayúsculas', () => {
    const producto = crear({ descripcion: 'Crema FACIAL de uso diario' });
    expect(producto.nombreBusqueda).toBe('crema hidratante esika 50 g');
    expect(producto.descripcionBusqueda).toBe('crema facial de uso diario');
  });

  it.each([
    ['nombre de 1 carácter', { nombre: 'A' }],
    ['nombre de 121 caracteres', { nombre: 'A'.repeat(121) }],
    ['nombre que no es texto', { nombre: 12 }],
    ['marca que no es UUID', { marcaId: 'abc' }],
    ['marca ausente', { marcaId: undefined }],
    ['descripción de 2001 caracteres', { descripcion: 'x'.repeat(2001) }],
    ['descripción que no es texto', { descripcion: 5 }],
    ['descripción nula', { descripcion: null }],
    ['disponibilidad desconocida', { disponibilidad: 'LIQUIDACION' }],
    ['disponibilidad nula', { disponibilidad: null }],
    ['precio cero', { precio: '0.00' }],
  ])('rechaza %s', (_caso, parcial) => {
    expect(() => crear(parcial)).toThrowError(DATOS_INVALIDOS);
  });

  it('acepta nombre de 2 y de 120 caracteres y descripción de 2000', () => {
    expect(() => crear({ nombre: 'AB' })).not.toThrow();
    expect(() => crear({ nombre: 'A'.repeat(120) })).not.toThrow();
    expect(() => crear({ descripcion: 'x'.repeat(2000) })).not.toThrow();
  });

  it.each(DISPONIBILIDADES)('acepta la disponibilidad %s (RN-09)', (valor) => {
    expect(validarDisponibilidad(valor)).toBe(valor);
    expect(crear({ disponibilidad: valor }).disponibilidad).toBe(valor);
  });

  describe('aplicar cambios parciales', () => {
    it('devuelve solo los campos que de verdad cambiaron', () => {
      const producto = crear();
      const resultado = producto.aplicar(
        {
          nombre: 'Crema hidratante Ésika 50 g',
          precio: '13.00',
          descripcion: 'Nueva',
        },
        DESPUES,
      );
      expect(resultado.campos).toEqual(['precio', 'descripcion']);
      expect(resultado.producto.precio.aTexto()).toBe('13.00');
      expect(resultado.producto.actualizadoEn).toEqual(DESPUES);
      // El original no cambia (inmutable).
      expect(producto.precio.aTexto()).toBe('12.50');
    });

    it('CA-05: si cambia el precio devuelve el anterior', () => {
      const { precioAnterior, producto } = crear().aplicar(
        { precio: '13' },
        DESPUES,
      );
      expect(precioAnterior?.aTexto()).toBe('12.50');
      expect(producto.precio.aTexto()).toBe('13.00');
    });

    it('«12.5» equivale a «12.50»: no cambia el precio', () => {
      const resultado = crear().aplicar({ precio: '12.5' }, DESPUES);
      expect(resultado.campos).toEqual([]);
      expect(resultado.precioAnterior).toBeNull();
      expect(resultado.producto).toBeInstanceOf(Producto);
    });

    it('sin cambios devuelve el mismo producto', () => {
      const producto = crear();
      const resultado = producto.aplicar({}, DESPUES);
      expect(resultado.producto).toBe(producto);
      expect(resultado.campos).toEqual([]);
    });

    it('RF-PRO-05: la disponibilidad cambia entre los 3 valores', () => {
      let producto = crear();
      for (const valor of ['AGOTADO', 'PENDIENTE_REPOSICION', 'DISPONIBLE']) {
        const resultado = producto.aplicar({ disponibilidad: valor }, DESPUES);
        expect(resultado.campos).toEqual(['disponibilidad']);
        producto = resultado.producto;
        expect(producto.disponibilidad).toBe(valor);
      }
    });

    it('cambia de marca', () => {
      const otra = '00000000-0000-4000-8000-0000000000b2';
      const resultado = crear().aplicar({ marcaId: otra }, DESPUES);
      expect(resultado.campos).toEqual(['marcaId']);
      expect(resultado.producto.marcaId).toBe(otra);
    });

    it('valida cada campo', () => {
      const producto = crear();
      for (const cambios of [
        { nombre: 'a' },
        { nombre: null },
        { marcaId: 'x' },
        { precio: '-1' },
        { precio: 12.5 },
        { precio: null },
        { descripcion: null },
        { disponibilidad: 'OTRA' },
      ]) {
        expect(() => producto.aplicar(cambios, DESPUES)).toThrowError(
          DATOS_INVALIDOS,
        );
      }
    });
  });
});

describe('RF-CAT-03: clave de búsqueda', () => {
  it('quita tildes, mayúsculas y espacios repetidos', () => {
    expect(claveDeBusqueda('  CRÉMA   Ésika ')).toBe('crema esika');
  });

  it('valida de 1 a 100 caracteres', () => {
    expect(validarBusqueda(' Ésika ')).toBe('esika');
    expect(() => validarBusqueda('')).toThrowError(DATOS_INVALIDOS);
    expect(() => validarBusqueda('   ')).toThrowError(DATOS_INVALIDOS);
    expect(() => validarBusqueda('a'.repeat(101))).toThrowError(
      DATOS_INVALIDOS,
    );
    expect(() => validarBusqueda(5)).toThrowError(DATOS_INVALIDOS);
    expect(validarBusqueda('a'.repeat(100))).toHaveLength(100);
  });
});
