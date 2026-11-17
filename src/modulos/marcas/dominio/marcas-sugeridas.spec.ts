import {
  buscarMarcaConocida,
  claveMarcaConocida,
  MARCAS_SUGERIDAS,
} from './marcas-sugeridas.js';

describe('D-56: marcas conocidas (fuente única)', () => {
  it.each([
    ["L'Bel", 'lbel'],
    ['L´Bel', 'lbel'],
    ['L’Bel', 'lbel'],
    ['lbel', 'lbel'],
    ['Ésika', 'esika'],
    ['AVON', 'avon'],
    [' Y a n b a l ', 'yanbal'],
  ])('la clave de «%s» es «%s»', (nombre, clave) => {
    expect(claveMarcaConocida(nombre)).toBe(clave);
  });

  it.each([
    ["L'Bel", "L'Bel"],
    ['L´Bel', "L'Bel"],
    ['lbel', "L'Bel"],
    ['Ésika', 'Esika'],
    ['AVON', 'Avon'],
    ['leonisa', 'Leonisa'],
  ])('«%s» se reconoce como «%s»', (nombre, oficial) => {
    expect(buscarMarcaConocida(nombre)?.nombre).toBe(oficial);
  });

  it.each(['Avon Plus', 'Mi Tienda', "'", '', 'Yanbals'])(
    '«%s» no es una marca conocida',
    (nombre) => {
      expect(buscarMarcaConocida(nombre)).toBeNull();
    },
  );

  it('cada marca de la lista se reconoce a sí misma con sus colores', () => {
    for (const marca of MARCAS_SUGERIDAS) {
      expect(buscarMarcaConocida(marca.nombre)).toBe(marca);
    }
  });
});
