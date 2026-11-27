import { partirNombreLargo } from './nombre-borrador.js';

describe('RF-PRO-01: un nombre largo se corta sin romperlo por «aprox.» ni dentro de un paréntesis', () => {
  it('«Colección Verena Collar (largo aprox. 41 a 47 cm…)»: el nombre termina antes del paréntesis', () => {
    const texto =
      'Colección Verena Collar (largo aprox. 41 a 47 cm, dije 2 cm) y aretes con pasador (aprox. 3.1 cm).';

    const { nombre, resto, recortado } = partirNombreLargo(texto);

    expect(nombre).toBe('Colección Verena Collar');
    expect(resto).toBe(
      '(largo aprox. 41 a 47 cm, dije 2 cm) y aretes con pasador (aprox. 3.1 cm).',
    );
    expect(recortado).toBe(true);
  });

  it('el punto de «aprox.» no cierra la oración; el de una oración real sí', () => {
    expect(
      partirNombreLargo(
        'Collar largo aprox. 41 a 47 cm con dije de cristal facetado y baño de oro de 24 quilates sobre latón',
      ).nombre,
    ).not.toBe('Collar largo aprox');
    expect(
      partirNombreLargo(
        'Crema reparadora intensiva. Para todo tipo de piel, con ácido hialurónico y vitamina E de alta absorción',
      ),
    ).toMatchObject({ nombre: 'Crema reparadora intensiva', recortado: true });
  });

  it('un nombre corto no se toca', () => {
    expect(partirNombreLargo('Pasión Parfum')).toEqual({
      nombre: 'Pasión Parfum',
      resto: '',
      recortado: false,
    });
  });
});
