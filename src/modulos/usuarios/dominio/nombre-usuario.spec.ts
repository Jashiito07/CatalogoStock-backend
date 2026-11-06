import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import { MENSAJE_NOMBRE_INVALIDO, NombreUsuario } from './nombre-usuario.js';

describe('Contrato de usuarios: objeto de valor NombreUsuario (2 a 100 caracteres)', () => {
  it('recorta los espacios del inicio y del final', () => {
    expect(NombreUsuario.crear('  María Zambrano  ').valor).toBe(
      'María Zambrano',
    );
  });

  it.each([
    ['de 2 caracteres', 'Al'],
    ['de 100 caracteres', 'a'.repeat(100)],
    ['de 100 caracteres con tildes', 'á'.repeat(100)],
  ])('acepta un nombre %s', (_caso, valor) => {
    expect(NombreUsuario.crear(valor).valor).toBe(valor);
  });

  it.each([
    ['vacío', ''],
    ['de solo espacios', '    '],
    ['de 1 carácter tras recortar', '  A  '],
    ['de 101 caracteres', 'a'.repeat(101)],
  ])('rechaza un nombre %s', (_caso, valor) => {
    expect(() => NombreUsuario.crear(valor)).toThrow(DatosInvalidosError);
  });

  it.each([undefined, null, 10])(
    'rechaza un valor que no es texto (%s)',
    (valor) => {
      expect(() => NombreUsuario.crear(valor)).toThrow(DatosInvalidosError);
    },
  );

  it('el error usa el mensaje del contrato y nombra el campo', () => {
    let error: unknown;
    try {
      NombreUsuario.crear('A');
    } catch (e) {
      error = e;
    }
    expect((error as DatosInvalidosError).detalles).toEqual({
      errores: [{ campo: 'nombre', errores: [MENSAJE_NOMBRE_INVALIDO] }],
    });
  });

  it('se serializa como texto', () => {
    const nombre = NombreUsuario.crear('Ana');
    expect(String(nombre)).toBe('Ana');
    expect(JSON.stringify({ nombre })).toBe('{"nombre":"Ana"}');
  });
});
