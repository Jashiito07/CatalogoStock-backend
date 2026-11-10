import { createHash } from 'node:crypto';
import { ProtectorCodigoRecuperacionCrypto } from './protector-codigo-recuperacion.crypto.js';

const SECRETO = 'secreto_falso_de_pruebas_con_32_caracteres_o_mas';

describe('RF-USU-05: protector del código de recuperación (node:crypto)', () => {
  const protector = new ProtectorCodigoRecuperacionCrypto(SECRETO);

  it('genera códigos de 6 dígitos', () => {
    for (let i = 0; i < 200; i++) {
      expect(protector.generar()).toMatch(/^\d{6}$/);
    }
  });

  it('el hash es un HMAC-SHA256 hexadecimal que no contiene el código ni es un SHA-256 simple', () => {
    const hash = protector.calcularHash('482913');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('482913');
    expect(hash).not.toBe(createHash('sha256').update('482913').digest('hex'));
    expect(protector.calcularHash('482913')).toBe(hash);
    expect(
      new ProtectorCodigoRecuperacionCrypto(`${SECRETO}x`).calcularHash(
        '482913',
      ),
    ).not.toBe(hash);
  });

  it('compara en tiempo constante: el correcto coincide y otro no', () => {
    const hash = protector.calcularHash('000123');
    expect(protector.coincide('000123', hash)).toBe(true);
    expect(protector.coincide('000124', hash)).toBe(false);
    expect(protector.coincide('000123', 'no-es-un-hash')).toBe(false);
  });

  it('no acepta un secreto vacío y no se serializa con el secreto', () => {
    expect(() => new ProtectorCodigoRecuperacionCrypto('')).toThrow(
      'Falta el secreto',
    );
    expect(JSON.stringify(protector)).not.toContain(SECRETO);
  });
});
