import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import {
  bytesUtf8,
  cumpleFortalezaClave,
  MENSAJE_CLAVE_DEBIL,
  validarFortalezaClave,
} from './clave.js';

describe('Contrato de usuarios: regla de fortaleza de la clave (8 a 72, letras y números)', () => {
  it.each([
    ['ejemplo del contrato', 'Catalogo2026'],
    ['exactamente 8 caracteres', 'abcdefg1'],
    ['exactamente 72 caracteres', `${'a'.repeat(71)}1`],
    ['con tildes y eñes', 'contraseña1'],
    ['con símbolos y espacios', 'mi clave #1'],
    ['número al inicio', '1clavesegura'],
  ])('acepta una clave %s', (_caso, clave) => {
    expect(cumpleFortalezaClave(clave)).toBe(true);
    expect(validarFortalezaClave(clave)).toBe(clave);
  });

  it.each([
    ['de 7 caracteres', 'abcdef1'],
    ['de 73 caracteres', `${'a'.repeat(72)}1`],
    ['solo letras', 'soloLetrasSinNumero'],
    ['solo números', '1234567890'],
    ['solo símbolos', '!@#$%^&*()'],
    ['vacía', ''],
    ['de solo espacios con un número', '       1'],
  ])('rechaza una clave %s', (_caso, clave) => {
    expect(cumpleFortalezaClave(clave)).toBe(false);
    expect(() => validarFortalezaClave(clave)).toThrow(DatosInvalidosError);
  });

  it.each([undefined, null, 12345678])(
    'rechaza un valor que no es texto (%s)',
    (valor) => {
      expect(cumpleFortalezaClave(valor)).toBe(false);
    },
  );

  describe('D-22: como máximo 72 bytes en UTF-8 (límite de bcrypt)', () => {
    it('cuenta bytes UTF-8: ASCII 1, tilde/ñ 2, emoji 4', () => {
      expect(bytesUtf8('a1')).toBe(2);
      expect(bytesUtf8('ñá')).toBe(4);
      expect(bytesUtf8('😀')).toBe(4);
    });

    it('acepta una clave ASCII de 72 caracteres (72 bytes)', () => {
      const clave = `${'a'.repeat(70)}12`;
      expect(bytesUtf8(clave)).toBe(72);
      expect(validarFortalezaClave(clave)).toBe(clave);
    });

    it('acepta una clave con tildes que ocupa exactamente 72 bytes', () => {
      const clave = `${'ñ'.repeat(35)}a1`; // 70 + 2 bytes, 37 caracteres
      expect(bytesUtf8(clave)).toBe(72);
      expect(cumpleFortalezaClave(clave)).toBe(true);
    });

    it.each([
      ['72 caracteres con eñes', `${'ñ'.repeat(70)}a1`],
      ['40 caracteres con tildes', `${'á'.repeat(38)}a1`],
      ['37 caracteres (73 bytes)', `${'ñ'.repeat(35)}a12`],
    ])(
      'rechaza una clave de %s que pasa de 72 bytes, con el mismo mensaje',
      (_caso, clave) => {
        expect([...clave].length).toBeLessThanOrEqual(72);
        expect(bytesUtf8(clave)).toBeGreaterThan(72);
        expect(cumpleFortalezaClave(clave)).toBe(false);
        expect(() => validarFortalezaClave(clave)).toThrow(MENSAJE_CLAVE_DEBIL);
      },
    );
  });

  it('no recorta la clave: los espacios cuentan como caracteres', () => {
    expect(validarFortalezaClave(' clave1 ')).toBe(' clave1 ');
  });

  it('el error usa el mensaje del contrato y nunca incluye la clave (RNF-02)', () => {
    let error: unknown;
    try {
      validarFortalezaClave('secreta');
    } catch (e) {
      error = e;
    }
    const datos = error as DatosInvalidosError;
    expect(datos.message).toBe(MENSAJE_CLAVE_DEBIL);
    expect(datos.detalles).toEqual({
      errores: [{ campo: 'clave', errores: [MENSAJE_CLAVE_DEBIL] }],
    });
    expect(JSON.stringify(datos)).not.toContain('secreta');
    expect(datos.message).not.toContain('secreta');
  });
});
