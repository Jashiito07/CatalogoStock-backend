import { Marca } from '../../dominio/marca.js';
import { MarcasServicio } from '../marcas.servicio.js';
import { ListarMarcasSugeridasCasoUso } from './listar-marcas-sugeridas.caso-uso.js';
import { ListarMarcasCasoUso } from './listar-marcas.caso-uso.js';
import { INICIO, MarcaRepositorioEnMemoria } from './dobles.prueba-spec.js';

const VENDEDOR = { id: 'v', rol: 'VENDEDOR' } as const;
const CLIENTE = { id: 'c', rol: 'CLIENTE' } as const;

function marca(n: number, nombre: string, orden: number, activa = true): Marca {
  const creada = Marca.crear({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    nombre,
    color: '#2563EB',
    orden,
    ahora: INICIO,
  });
  return activa ? creada : creada.aplicar({ activa: false }, INICIO).marca;
}

describe('RF-PRO-04 / RF-CAT-05: listar marcas', () => {
  let repositorio: MarcaRepositorioEnMemoria;

  beforeEach(() => {
    repositorio = new MarcaRepositorioEnMemoria();
    repositorio.marcas = [
      marca(1, 'Esika', 2),
      marca(2, 'Avon', 1),
      marca(3, 'Cyzone', 1, false),
      marca(4, 'Ábaco', 1),
    ];
  });

  it('ordena por orden y luego por nombre, y por defecto solo muestra activas', async () => {
    const lista = await new ListarMarcasCasoUso(repositorio).ejecutar(
      VENDEDOR,
      false,
    );
    expect(lista.map((m) => m.nombre)).toEqual(['Ábaco', 'Avon', 'Esika']);
  });

  it('el Vendedor con incluirInactivas ve también las inactivas', async () => {
    const lista = await new ListarMarcasCasoUso(repositorio).ejecutar(
      VENDEDOR,
      true,
    );
    expect(lista.map((m) => m.nombre)).toEqual([
      'Ábaco',
      'Avon',
      'Cyzone',
      'Esika',
    ]);
  });

  it('RF-PRO-04: con rol Cliente incluirInactivas se ignora', async () => {
    const lista = await new ListarMarcasCasoUso(repositorio).ejecutar(
      CLIENTE,
      true,
    );
    expect(lista.map((m) => m.nombre)).toEqual(['Ábaco', 'Avon', 'Esika']);
    expect(lista.every((m) => m.activa)).toBe(true);
  });
});

describe('RF-PRO-06 / D-48: marcas sugeridas', () => {
  it('sin marcas, ninguna está creada', async () => {
    const lista = await new ListarMarcasSugeridasCasoUso(
      new MarcaRepositorioEnMemoria(),
    ).ejecutar();
    expect(lista).toHaveLength(6);
    expect(lista.every((s) => !s.yaCreada)).toBe(true);
    expect(lista.find((s) => s.nombre === 'Leonisa')).toEqual({
      nombre: 'Leonisa',
      color: '#222221',
      colorAcento: '#F36E21',
      yaCreada: false,
    });
  });

  it('yaCreada ignora mayúsculas y tildes, y cuenta las marcas inactivas', async () => {
    const repositorio = new MarcaRepositorioEnMemoria();
    repositorio.marcas = [
      marca(1, 'YANBAL', 0),
      marca(2, 'Ésika', 1, false),
      marca(3, 'Otra marca', 2),
    ];
    const lista = await new ListarMarcasSugeridasCasoUso(
      repositorio,
    ).ejecutar();
    const creadas = lista.filter((s) => s.yaCreada).map((s) => s.nombre);
    expect(creadas).toEqual(['Yanbal', 'Esika']);
  });
});

describe('MarcasServicio (servicio público para productos)', () => {
  it('devuelve la marca pública (activa o inactiva) o null', async () => {
    const repositorio = new MarcaRepositorioEnMemoria();
    repositorio.marcas = [marca(1, 'Avon', 0, false)];
    const servicio = new MarcasServicio(repositorio);
    expect(await servicio.buscarPorId(repositorio.marcas[0].id)).toMatchObject({
      nombre: 'Avon',
      activa: false,
      textoSobreColor: '#FFFFFF',
    });
    expect(
      await servicio.buscarPorId('00000000-0000-4000-8000-0000000000ff'),
    ).toBeNull();
    expect(
      await servicio.buscarPorIds([repositorio.marcas[0].id]),
    ).toHaveLength(1);
  });
});
