import { Dinero } from './dinero.js';
import { DatosInvalidosError } from './errores.js';

function capturarError(accion: () => unknown): unknown {
  try {
    accion();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('Dinero: monto exacto en centavos (backend-typeorm, contrato de API)', () => {
  describe('desdeTexto', () => {
    it.each([
      ['12.50', '12.50'],
      ['12.5', '12.50'],
      ['12', '12.00'],
      ['0', '0.00'],
      ['0.01', '0.01'],
      ['9999999999.99', '9999999999.99'],
    ])(
      'Dado "%s", cuando se crea, entonces aTexto es "%s"',
      (entrada, salida) => {
        expect(Dinero.desdeTexto(entrada).aTexto()).toBe(salida);
      },
    );

    it.each([
      ['más de 2 decimales', '1.234'],
      ['negativo', '-1.00'],
      ['vacío', ''],
      ['letras', 'abc'],
      ['coma decimal', '1,50'],
      ['punto final', '12.'],
      ['punto inicial', '.50'],
      ['espacios', ' 1.00'],
      ['notación científica', '1e3'],
      ['más de 10 dígitos enteros', '12345678901'],
    ])('rechaza un monto con %s ("%s")', (_caso, entrada) => {
      expect(() => Dinero.desdeTexto(entrada)).toThrow(DatosInvalidosError);
    });

    it('el error usa el código DATOS_INVALIDOS', () => {
      const error = capturarError(() => Dinero.desdeTexto('1.234'));
      expect(error).toBeInstanceOf(DatosInvalidosError);
      expect(error).toMatchObject({ codigo: 'DATOS_INVALIDOS' });
    });
  });

  describe('operaciones exactas', () => {
    it('Dado 0.10, cuando se multiplica por 3, entonces es "0.30" (no 0.30000000000000004)', () => {
      expect(Dinero.desdeTexto('0.10').multiplicar(3).aTexto()).toBe('0.30');
    });

    it('Dado 0.10 + 0.20, entonces es "0.30"', () => {
      const suma = Dinero.desdeTexto('0.10').sumar(Dinero.desdeTexto('0.20'));
      expect(suma.aTexto()).toBe('0.30');
    });

    it('suma las líneas de un pedido sin pérdida de precisión', () => {
      const total = [
        Dinero.desdeTexto('19.99').multiplicar(3),
        Dinero.desdeTexto('0.01').multiplicar(7),
        Dinero.desdeTexto('125.5').multiplicar(1),
      ].reduce((acumulado, linea) => acumulado.sumar(linea), Dinero.CERO);
      expect(total.aTexto()).toBe('185.54');
    });

    it('multiplicar por 0 da "0.00"', () => {
      expect(Dinero.desdeTexto('15.75').multiplicar(0).aTexto()).toBe('0.00');
    });

    it.each([[-1], [1.5], [Number.NaN], [Number.MAX_SAFE_INTEGER + 1]])(
      'rechaza multiplicar por una cantidad no entera o negativa (%s)',
      (cantidad) => {
        expect(() => Dinero.desdeTexto('1.00').multiplicar(cantidad)).toThrow(
          DatosInvalidosError,
        );
      },
    );

    it('es inmutable: sumar no cambia el original', () => {
      const original = Dinero.desdeTexto('1.00');
      original.sumar(Dinero.desdeTexto('2.00'));
      expect(original.aTexto()).toBe('1.00');
    });
  });

  describe('comparar', () => {
    const uno = Dinero.desdeTexto('1.00');
    const dos = Dinero.desdeTexto('2');

    it('compara montos', () => {
      expect(uno.comparar(dos)).toBe(-1);
      expect(dos.comparar(uno)).toBe(1);
      expect(uno.comparar(Dinero.desdeTexto('1'))).toBe(0);
      expect(uno.esMenorQue(dos)).toBe(true);
      expect(dos.esMayorQue(uno)).toBe(true);
      expect(uno.esIgualA(Dinero.desdeTexto('1.0'))).toBe(true);
    });
  });

  describe('centavos y serialización', () => {
    it('desdeCentavos y enCentavos son exactos', () => {
      const monto = Dinero.desdeCentavos(1250n);
      expect(monto.aTexto()).toBe('12.50');
      expect(monto.enCentavos()).toBe(1250n);
    });

    it('rechaza centavos negativos', () => {
      expect(() => Dinero.desdeCentavos(-1n)).toThrow(DatosInvalidosError);
    });

    it('se serializa en JSON como texto decimal, nunca como número', () => {
      expect(JSON.stringify({ total: Dinero.desdeTexto('7.5') })).toBe(
        '{"total":"7.50"}',
      );
      expect(String(Dinero.desdeTexto('3'))).toBe('3.00');
    });
  });
});
