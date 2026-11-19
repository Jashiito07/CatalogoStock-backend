import { crearPaginacion } from '../../../../compartido/dominio/paginacion.js';
import { ProductosServicio } from '../productos.servicio.js';
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

describe('D-57: código del producto y servicio público para los catálogos mensuales', () => {
  let repositorio: ProductoRepositorioEnMemoria;
  let auditoria: AuditoriaFalsa;
  let servicio: ProductosServicio;

  beforeEach(() => {
    repositorio = new ProductoRepositorioEnMemoria();
    const marcas = new DirectorioMarcasEnMemoria();
    const unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    const reloj = new RelojFalso();
    servicio = new ProductosServicio(
      repositorio,
      new CrearProductoCasoUso(
        repositorio,
        marcas,
        generadorIdSecuencial(),
        reloj,
        unidad,
        auditoria,
      ),
      new ActualizarProductoCasoUso(repositorio, marcas, reloj, unidad, auditoria),
    );
  });

  const crear = (extra: Record<string, unknown> = {}) =>
    servicio.crear({
      idVendedor: ID_VENDEDOR,
      nombre: 'Crema',
      marcaId: ID_MARCA_ACTIVA,
      precio: '30.00',
      ...extra,
    });

  it('crear con código lo guarda y lo devuelve; sin código queda en null', async () => {
    expect((await crear({ codigo: '43873' })).codigo).toBe('43873');
    expect((await crear({ nombre: 'Otro' })).codigo).toBeNull();
  });

  it('el mismo código en la misma marca → CODIGO_DUPLICADO (409); no se crea el segundo', async () => {
    await crear({ codigo: '43873' });

    await expect(crear({ codigo: '43873', nombre: 'Otro' })).rejects.toMatchObject({
      codigo: 'CODIGO_DUPLICADO',
      categoria: 'CONFLICTO',
    });
    expect(repositorio.productos).toHaveLength(1);
  });

  it('un código inválido → DATOS_INVALIDOS', async () => {
    await expect(crear({ codigo: 'con espacio' })).rejects.toMatchObject({
      codigo: 'DATOS_INVALIDOS',
    });
  });

  it('un producto eliminado no bloquea su código', async () => {
    const primero = await crear({ codigo: '43873' });
    repositorio.eliminados.add(primero.id);

    await expect(crear({ codigo: '43873', nombre: 'Nuevo' })).resolves.toMatchObject({
      codigo: '43873',
    });
    expect(await servicio.codigosExistentes(ID_MARCA_ACTIVA, ['43873'])).toEqual(
      new Set(['43873']),
    );
  });

  it('buscarPorCodigos y bloquearPorCodigo devuelven solo productos no eliminados de la marca', async () => {
    const vivo = await crear({ codigo: '1' });
    const borrado = await crear({ codigo: '2', nombre: 'Borrado' });
    repositorio.eliminados.add(borrado.id);

    expect((await servicio.buscarPorCodigos(ID_MARCA_ACTIVA, ['1', '2'])).map((p) => p.id)).toEqual([
      vivo.id,
    ]);
    expect((await servicio.bloquearPorCodigo(ID_MARCA_ACTIVA, '1'))?.id).toBe(vivo.id);
    expect(await servicio.bloquearPorCodigo(ID_MARCA_ACTIVA, '2')).toBeNull();
    expect(await servicio.buscarPorCodigos(ID_MARCA_ACTIVA, [])).toEqual([]);
  });

  it('D-57: buscarSinCodigoPorNombres devuelve solo productos sin código, de la marca y no eliminados, sin distinguir mayúsculas, tildes ni signos', async () => {
    const sinCodigo = await crear({ nombre: 'Jabón Líquido Avena' });
    await crear({ nombre: 'Jabon liquido avena', codigo: '1' });
    const borrado = await crear({ nombre: 'JABÓN, líquido... avena' });
    repositorio.eliminados.add(borrado.id);
    await crear({ nombre: 'Otro Producto' });

    const encontrados = await servicio.buscarSinCodigoPorNombres(ID_MARCA_ACTIVA, [
      'jabon (liquido) AVENA!',
    ]);

    expect(encontrados.map((p) => p.id)).toEqual([sinCodigo.id]);
    expect(await servicio.buscarSinCodigoPorNombres(ID_MARCA_ACTIVA, ['¡¡¡', ''])).toEqual([]);
    expect(
      (await servicio.bloquearSinCodigoPorNombre(ID_MARCA_ACTIVA, 'Jabón Líquido Avena')).map(
        (p) => p.id,
      ),
    ).toEqual([sinCodigo.id]);
    expect(await servicio.bloquearSinCodigoPorNombre(ID_MARCA_ACTIVA, '...')).toEqual([]);
  });

  it('PA-07, D-57: actualizarPrecio cambia solo el precio y la bitácora guarda precioAnterior y precioNuevo', async () => {
    const producto = await crear({
      codigo: '43873',
      nombre: 'Editado por el Vendedor',
      descripcion: 'Texto propio',
      disponibilidad: 'AGOTADO',
    });
    auditoria.registradas.length = 0;

    await servicio.actualizarPrecio({
      idVendedor: ID_VENDEDOR,
      idProducto: producto.id,
      precio: '35',
    });

    const despues = await servicio.buscarPorId(producto.id);
    expect(despues).toMatchObject({
      nombre: 'Editado por el Vendedor',
      descripcion: 'Texto propio',
      disponibilidad: 'AGOTADO',
      codigo: '43873',
    });
    expect(despues?.precio.aTexto()).toBe('35.00');
    expect(auditoria.registradas.map((r) => r.actividad)).toEqual([
      {
        accion: 'PRODUCTO_ACTUALIZADO',
        idUsuario: ID_VENDEDOR,
        entidad: 'PRODUCTO',
        idEntidad: producto.id,
        detalle: { campos: ['precio'], precioAnterior: '30.00', precioNuevo: '35.00' },
      },
    ]);
  });

  it('actualizarPrecio con el mismo precio no escribe ni registra nada', async () => {
    const producto = await crear({ codigo: '1' });
    auditoria.registradas.length = 0;

    await servicio.actualizarPrecio({
      idVendedor: ID_VENDEDOR,
      idProducto: producto.id,
      precio: '30.00',
    });

    expect(auditoria.registradas).toHaveLength(0);
  });

  it('listarAusentes: productos de la marca con código que no están en la lista; sin cambiar nada', async () => {
    await crear({ codigo: '1', nombre: 'Producto A' });
    await crear({ codigo: '2', nombre: 'Producto B' });
    await crear({ nombre: 'Sin código' });

    const pagina = await servicio.listarAusentes(ID_MARCA_ACTIVA, ['1'], crearPaginacion());

    expect(pagina.total).toBe(1);
    expect(pagina.elementos[0]).toMatchObject({ nombre: 'Producto B', codigo: '2' });
  });

  it('cambiar el código de un producto a uno ya usado en la marca → CODIGO_DUPLICADO', async () => {
    await crear({ codigo: '1' });
    const otro = await crear({ codigo: '2', nombre: 'Otro' });
    const actualizar = new ActualizarProductoCasoUso(
      repositorio,
      new DirectorioMarcasEnMemoria(),
      new RelojFalso(),
      new UnidadDeTrabajoFalsa(),
      auditoria,
    );

    await expect(
      actualizar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idProducto: otro.id,
        cambios: { codigo: '1' },
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_DUPLICADO' });
  });
});
