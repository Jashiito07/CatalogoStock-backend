import {
  COSTO_BCRYPT_POR_DEFECTO,
  GeneradorHashBcrypt,
} from './generador-hash.bcrypt.js';

const CLAVE = 'Catalogo2026';

describe('RNF-02 / D-08: GeneradorHashBcrypt', () => {
  it('el costo por defecto es 12', () => {
    expect(COSTO_BCRYPT_POR_DEFECTO).toBe(12);
  });

  it('genera un hash bcrypt de costo 12 que no contiene la clave', async () => {
    const generador = new GeneradorHashBcrypt();

    const hash = await generador.generar(CLAVE);

    expect(hash).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
    expect(hash).not.toContain(CLAVE);
  });

  describe('con costo bajo (solo para que la prueba sea rápida)', () => {
    const generador = new GeneradorHashBcrypt(4);

    it('la misma clave produce hashes distintos (sal aleatoria)', async () => {
      const [a, b] = await Promise.all([
        generador.generar(CLAVE),
        generador.generar(CLAVE),
      ]);
      expect(a).not.toBe(b);
    });

    it('compara correctamente la clave correcta y una incorrecta', async () => {
      const hash = await generador.generar(CLAVE);
      await expect(generador.comparar(CLAVE, hash)).resolves.toBe(true);
      await expect(generador.comparar('Catalogo2027', hash)).resolves.toBe(
        false,
      );
    });

    it('un hash mal formado se trata como clave incorrecta, sin lanzar', async () => {
      await expect(generador.comparar(CLAVE, 'no-es-un-hash')).resolves.toBe(
        false,
      );
      await expect(generador.comparar(CLAVE, '')).resolves.toBe(false);
    });
  });

  it.each([3, 32, 12.5, Number.NaN])(
    'rechaza el costo inválido %s',
    (costo) => {
      expect(() => new GeneradorHashBcrypt(costo)).toThrow(
        'El costo de bcrypt',
      );
    },
  );
});
