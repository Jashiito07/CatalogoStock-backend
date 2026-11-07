import {
  crearPaginacion,
  desplazamiento,
  PAGINA_POR_DEFECTO,
  TAMANIO_MAXIMO,
  TAMANIO_POR_DEFECTO,
} from './paginacion.js';

describe('Paginación del contrato (README)', () => {
  it('por defecto: página 1 de 20', () => {
    expect(crearPaginacion()).toEqual({
      pagina: PAGINA_POR_DEFECTO,
      tamanio: TAMANIO_POR_DEFECTO,
    });
  });

  it('respeta valores válidos', () => {
    expect(crearPaginacion(3, 100)).toEqual({ pagina: 3, tamanio: 100 });
  });

  it('acota por defensa los valores fuera de rango', () => {
    expect(crearPaginacion(0, 0)).toEqual({ pagina: 1, tamanio: 20 });
    expect(crearPaginacion(1.5, 500)).toEqual({
      pagina: 1,
      tamanio: TAMANIO_MAXIMO,
    });
    expect(crearPaginacion(Number.NaN, -1)).toEqual({ pagina: 1, tamanio: 20 });
  });

  it('desplazamiento = (pagina - 1) × tamanio', () => {
    expect(desplazamiento({ pagina: 1, tamanio: 20 })).toBe(0);
    expect(desplazamiento({ pagina: 3, tamanio: 2 })).toBe(4);
  });
});
