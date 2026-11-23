import { crearPaginacion } from '../../../../compartido/dominio/paginacion.js';
import { ActualizarProductoCasoUso } from './actualizar-producto.caso-uso.js';
import { CrearProductoCasoUso } from './crear-producto.caso-uso.js';
import {
  AuditoriaFalsa,
  DirectorioMarcasEnMemoria,
  generadorIdSecuencial,
  ID_MARCA_ACTIVA,
  ID_VENDEDOR,
  ProductoRepositorioEnMemoria,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';
import { EliminarProductoCasoUso } from './eliminar-producto.caso-uso.js';
import { ListarProductosCasoUso } from './listar-productos.caso-uso.js';
import { ObtenerProductoCasoUso } from './obtener-producto.caso-uso.js';

const OTRO_VENDEDOR = '00000000-0000-4000-8000-0000000000ab';
const PRIMERO = { id: ID_VENDEDOR, rol: 'VENDEDOR' } as const;
const SEGUNDO = { id: OTRO_VENDEDOR, rol: 'VENDEDOR' } as const;
const CLIENTE = { id: 'c', rol: 'CLIENTE' } as const;

describe('D-60: propiedad de los productos por Vendedor', () => {
  let productos: ProductoRepositorioEnMemoria;
  let crear: CrearProductoCasoUso;
  let actualizar: ActualizarProductoCasoUso;
  let eliminar: EliminarProductoCasoUso;
  let listar: ListarProductosCasoUso;
  let obtener: ObtenerProductoCasoUso;

  beforeEach(() => {
    productos = new ProductoRepositorioEnMemoria();
    const marcas = new DirectorioMarcasEnMemoria();
    const unidad = new UnidadDeTrabajoFalsa();
    const auditoria = new AuditoriaFalsa(unidad);
    const reloj = new RelojFalso();
    crear = new CrearProductoCasoUso(productos, marcas, generadorIdSecuencial(), reloj, unidad, auditoria);
    actualizar = new ActualizarProductoCasoUso(productos, marcas, reloj, unidad, auditoria);
    eliminar = new EliminarProductoCasoUso(productos, reloj, unidad, auditoria);
    listar = new ListarProductosCasoUso(productos, marcas);
    obtener = new ObtenerProductoCasoUso(productos, marcas);
  });

  const nuevo = (idVendedor: string, extra: Record<string, unknown> = {}) =>
    crear.ejecutar({ idVendedor, nombre: 'Crema', marcaId: ID_MARCA_ACTIVA, precio: '10.00', ...extra });

  const NO_ENCONTRADO = { codigo: 'NO_ENCONTRADO', categoria: 'NO_ENCONTRADO' };

  it('el producto nuevo lleva el Vendedor autenticado como dueño', async () => {
    const { producto } = await nuevo(ID_VENDEDOR);
    expect(producto.idVendedor).toBe(ID_VENDEDOR);
  });

  it('un segundo Vendedor recibe 404 al consultar, cambiar o eliminar el producto del primero, y nada cambia', async () => {
    const { producto } = await nuevo(ID_VENDEDOR);

    await expect(obtener.ejecutar(SEGUNDO, producto.id)).rejects.toMatchObject(NO_ENCONTRADO);
    await expect(
      actualizar.ejecutar({ idVendedor: OTRO_VENDEDOR, idProducto: producto.id, cambios: { precio: '99' } }),
    ).rejects.toMatchObject(NO_ENCONTRADO);
    await expect(
      eliminar.ejecutar({ idVendedor: OTRO_VENDEDOR, idProducto: producto.id }),
    ).rejects.toMatchObject(NO_ENCONTRADO);

    expect(productos.eliminados.size).toBe(0);
    expect(productos.productos[0].precio.aTexto()).toBe('10.00');
  });

  it('el Vendedor solo lista sus productos; el Cliente ve los de todos', async () => {
    await nuevo(ID_VENDEDOR, { nombre: 'Del primero' });
    await nuevo(OTRO_VENDEDOR, { nombre: 'Del segundo' });
    const pagina = crearPaginacion();

    expect((await listar.ejecutar(PRIMERO, { paginacion: pagina })).total).toBe(1);
    expect((await listar.ejecutar(SEGUNDO, { paginacion: pagina })).total).toBe(1);
    expect((await listar.ejecutar(CLIENTE, { paginacion: pagina })).total).toBe(2);
  });

  it('el Cliente sí consulta el producto de cualquier Vendedor (catálogo)', async () => {
    const { producto } = await nuevo(ID_VENDEDOR);
    await expect(obtener.ejecutar(CLIENTE, producto.id)).resolves.toMatchObject({
      producto: { id: producto.id },
    });
  });

  it('el mismo código en la misma marca sí se admite en dos Vendedores distintos', async () => {
    await nuevo(ID_VENDEDOR, { codigo: '43873' });
    await expect(nuevo(OTRO_VENDEDOR, { codigo: '43873' })).resolves.toBeDefined();
    await expect(nuevo(ID_VENDEDOR, { codigo: '43873', nombre: 'Otro' })).rejects.toMatchObject({
      codigo: 'CODIGO_DUPLICADO',
    });
  });
});
