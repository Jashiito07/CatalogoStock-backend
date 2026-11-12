import { claveDeNombreMarca, NombreMarca } from './nombre-marca.js';

const DATOS_INVALIDOS = expect.objectContaining({ codigo: 'DATOS_INVALIDOS' });

describe('RF-PRO-04: nombre de la marca', () => {
  it('recorta y une los espacios', () => {
    expect(NombreMarca.crear("  L'Bel   Paris ").valor).toBe("L'Bel Paris");
  });

  it('acepta 2 y 40 caracteres, y rechaza 1 y 41', () => {
    expect(NombreMarca.crear('ab').valor).toBe('ab');
    expect(NombreMarca.crear('a'.repeat(40)).valor).toHaveLength(40);
    expect(() => NombreMarca.crear('a')).toThrowError(
      expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
    );
    expect(() => NombreMarca.crear('a'.repeat(41))).toThrowError(
      expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
    );
    expect(() => NombreMarca.crear('   ')).toThrowError(DATOS_INVALIDOS);
    expect(() => NombreMarca.crear(undefined)).toThrowError(DATOS_INVALIDOS);
    expect(() => NombreMarca.crear(123)).toThrowError(DATOS_INVALIDOS);
  });

  it('cuenta caracteres y no unidades UTF-16', () => {
    expect(NombreMarca.crear('😀'.repeat(40)).valor).toHaveLength(80);
    expect(() => NombreMarca.crear('😀'.repeat(41))).toThrowError(
      DATOS_INVALIDOS,
    );
  });

  it('la clave ignora mayúsculas, tildes y espacios repetidos', () => {
    expect(claveDeNombreMarca('  ÉSIKA ')).toBe('esika');
    expect(NombreMarca.crear('Ésika').clave).toBe(
      NombreMarca.crear('ESIKA').clave,
    );
    expect(NombreMarca.crear('Ñandú  Bel').clave).toBe('nandu bel');
    expect(NombreMarca.crear('Esika').clave).not.toBe(
      NombreMarca.crear('Cyzone').clave,
    );
  });
});
