import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import { MENSAJE_TELEFONO_INVALIDO, Telefono } from './telefono.js';

describe('D-14: objeto de valor Telefono (solo celular de Ecuador en E.164)', () => {
  it('Dado 0991234567, cuando se crea, entonces se guarda como +593991234567', () => {
    expect(Telefono.crear('0991234567').valor).toBe('+593991234567');
  });

  it.each([
    ['+593991234567', '+593991234567'],
    ['099 123 4567', '+593991234567'],
    ['099-123-4567', '+593991234567'],
    [' +593 99 123 4567 ', '+593991234567'],
    ['+593-98-765-4321', '+593987654321'],
    ['0900000000', '+593900000000'],
  ])('acepta %s y lo normaliza a %s', (entrada, esperado) => {
    expect(Telefono.crear(entrada).valor).toBe(esperado);
  });

  it.each([
    ['fijo de Ecuador con prefijo de provincia', '052123456'],
    ['fijo en E.164', '+59352123456'],
    ['celular sin el 0 inicial', '991234567'],
    ['celular con 9 dígitos', '099123456'],
    ['celular con 11 dígitos', '09912345678'],
    ['E.164 sin el +', '593991234567'],
    ['número de Colombia', '+573001234567'],
    ['número de Estados Unidos', '+12025550123'],
    ['E.164 de Ecuador que no es celular', '+593291234567'],
    ['con letras', '09912345ab'],
    ['con paréntesis', '(099) 123 4567'],
    ['vacío', ''],
  ])('rechaza un %s (%s)', (_caso, entrada) => {
    expect(() => Telefono.crear(entrada)).toThrow(DatosInvalidosError);
  });

  it.each([undefined, null, 991234567])(
    'rechaza un valor que no es texto (%s)',
    (valor) => {
      expect(() => Telefono.crear(valor)).toThrow(DatosInvalidosError);
    },
  );

  it('el error usa el mensaje del contrato y no repite el número', () => {
    let error: unknown;
    try {
      Telefono.crear('052123456');
    } catch (e) {
      error = e;
    }
    const datos = error as DatosInvalidosError;
    expect(datos.message).toBe(MENSAJE_TELEFONO_INVALIDO);
    expect(datos.detalles).toEqual({
      errores: [{ campo: 'telefono', errores: [MENSAJE_TELEFONO_INVALIDO] }],
    });
    expect(JSON.stringify(datos.detalles)).not.toContain('052123456');
  });

  it('el formato nacional y el internacional del mismo celular son iguales', () => {
    expect(
      Telefono.crear('0991234567').esIgualA(Telefono.crear('+593991234567')),
    ).toBe(true);
    expect(
      Telefono.crear('0991234567').esIgualA(Telefono.crear('0991234568')),
    ).toBe(false);
  });

  it('se serializa como texto E.164', () => {
    const telefono = Telefono.crear('0991234567');
    expect(String(telefono)).toBe('+593991234567');
    expect(JSON.stringify({ telefono })).toBe('{"telefono":"+593991234567"}');
  });
});
