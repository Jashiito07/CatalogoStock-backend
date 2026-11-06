import { GeneradorTokenRenovacionCrypto } from './generador-token-renovacion.crypto.js';

describe('D-09: GeneradorTokenRenovacionCrypto', () => {
  const generador = new GeneradorTokenRenovacionCrypto();

  it('genera tokens opacos de 256 bits en base64url, distintos cada vez', () => {
    const a = generador.generar();
    const b = generador.generar();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it('el hash es SHA-256 en hexadecimal, determinista y distinto del token', () => {
    const token = generador.generar();

    const hash = generador.calcularHash(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generador.calcularHash(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});
