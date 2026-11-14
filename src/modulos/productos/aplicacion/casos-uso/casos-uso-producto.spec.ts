import { crearPaginacion } from '../../../../compartido/dominio/paginacion.js';
import { ActualizarProductoCasoUso } from './actualizar-producto.caso-uso.js';
import { CrearProductoCasoUso } from './crear-producto.caso-uso.js';
import {
  AuditoriaFalsa,
  DirectorioMarcasEnMemoria,
  generadorIdSecuencial,
  ID_MARCA_ACTIVA,
  ID_MARCA_INACTIVA,
  ID_MARCA_INEXISTENTE,
  ID_VENDEDOR,
  ProductoRepositorioEnMemoria,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';
import { EliminarProductoCasoUso } from './eliminar-producto.caso-uso.js';
import { ListarProductosCasoUso } from './listar-productos.caso-uso.js';
import { ObtenerProductoCasoUso } from './obtener-producto.caso-uso.js';

const VENDEDOR = { id: ID_VENDEDOR, rol: 'VENDEDOR' } as const;
const CLIENTE = { id: 'c', rol: 'CLIENTE' } as const;

describe('Casos de uso de productos', () => {
  let productos: ProductoRepositorioEnMemoria;
  let marcas: DirectorioMarcasEnMemoria;
  let unidad: UnidadDeTrabajoFalsa;
  let auditoria: AuditoriaFalsa;
  let crear: CrearProductoCasoUso;
  let actualizar: ActualizarProductoCasoUso;
  let eliminar: EliminarProductoCasoUso;

  beforeEach(() => {
    productos = new ProductoRepositorioEnMemoria();
    marcas = new DirectorioMarcasEnMemoria();
    unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    const reloj = new RelojFalso();
    crear = new CrearProductoCasoUso(
      productos,
      marcas,
      generadorIdSecuencial(),
      reloj,
      unidad,
      auditoria,
    );
    actualizar = new ActualizarProductoCasoUso(
      productos,
      marcas,
      reloj,
      unidad,
      auditoria,
    );
    eliminar = new EliminarProductoCasoUso(productos, reloj, unidad, auditoria);
  });

  const nuevo = (extra: Record<string, unknown> = {}) =>
    crear.ejecutar({
      idVendedor: ID_VENDEDOR,
      nombre: 'Crema Ésika',
      marcaId: ID_MARCA_ACTIVA,
      precio: '12.50',
      ...extra,
    });

  describe('CA-04: crear', () => {
    it('crea el producto y registra PRODUCTO_CREADO en la misma transacción', async () => {
      const vista = await nuevo();
      expect(vista.producto.precio.aTexto()).toBe('12.50');
      expect(vista.producto.disponibilidad).toBe('DISPONIBLE');
      expect(vista.marca.nombre).toBe('Avon');
      expect(auditoria.registradas).toEqual([
        {
          actividad: {
            accion: 'PRODUCTO_CREADO',
            idUsuario: ID_VENDEDOR,
            entidad: 'PRODUCTO',
            idEntidad: vista.producto.id,
            detalle: { marcaId: ID_MARCA_ACTIVA },
          },
          enTransaccion: true,
        },
      ]);
    });

    it('marca inexistente → 404 y no guarda', async () => {
      await expect(
        nuevo({ marcaId: ID_MARCA_INEXISTENTE }),
      ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      expect(productos.productos).toHaveLength(0);
    });

    it('marca inactiva → MARCA_INACTIVA y no guarda', async () => {
      await expect(nuevo({ marcaId: ID_MARCA_INACTIVA })).rejects.toMatchObject(
        { codigo: 'MARCA_INACTIVA', categoria: 'REGLA_NEGOCIO' },
      );
      expect(productos.productos).toHaveLength(0);
      expect(auditoria.acciones()).toEqual([]);
    });

    it('precio inválido → DATOS_INVALIDOS sin consultar la marca', async () => {
      await expect(nuevo({ precio: '12.505' })).rejects.toMatchObject({
        codigo: 'DATOS_INVALIDOS',
      });
      expect(productos.productos).toHaveLength(0);
    });

    it('si la bitácora falla, el error se propaga', async () => {
      auditoria.fallo = new Error('bitácora caída');
      await expect(nuevo()).rejects.toThrow('bitácora caída');
    });
  });

  describe('CA-05 / CA-07: actualizar', () => {
    it('cambia el precio y la bitácora guarda anterior y nuevo', async () => {
      const { producto } = await nuevo();
      auditoria.registradas.length = 0;
      const vista = await actualizar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idProducto: producto.id,
        cambios: { precio: '13' },
      });
      expect(vista.producto.precio.aTexto()).toBe('13.00');
      expect(auditoria.registradas[0].actividad).toMatchObject({
        accion: 'PRODUCTO_ACTUALIZADO',
        detalle: {
          campos: ['precio'],
          precioAnterior: '12.50',
          precioNuevo: '13.00',
        },
      });
      expect(auditoria.registradas[0].enTransaccion).toBe(true);
    });

    it('sin cambio de precio no incluye precioAnterior', async () => {
      const { producto } = await nuevo();
      auditoria.registradas.length = 0;
      await actualizar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idProducto: producto.id,
        cambios: { disponibilidad: 'AGOTADO' },
      });
      expect(auditoria.registradas[0].actividad.detalle).toEqual({
        campos: ['disponibilidad'],
      });
    });

    it('sin cambios reales no registra nada', async () => {
      const { producto } = await nuevo();
      auditoria.registradas.length = 0;
      await actualizar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idProducto: producto.id,
        cambios: { precio: '12.5', nombre: 'Crema Ésika' },
      });
      expect(auditoria.registradas).toHaveLength(0);
    });

    it('cambiar a una marca inactiva → MARCA_INACTIVA; a una inexistente → 404', async () => {
      const { producto } = await nuevo();
      await expect(
        actualizar.ejecutar({
          idVendedor: ID_VENDEDOR,
          idProducto: producto.id,
          cambios: { marcaId: ID_MARCA_INACTIVA },
        }),
      ).rejects.toMatchObject({ codigo: 'MARCA_INACTIVA' });
      await expect(
        actualizar.ejecutar({
          idVendedor: ID_VENDEDOR,
          idProducto: producto.id,
          cambios: { marcaId: ID_MARCA_INEXISTENTE },
        }),
      ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    });

    it('editar el precio de un producto cuya marca quedó inactiva sí se permite', async () => {
      const { producto } = await nuevo();
      marcas.marcas[0] = { ...marcas.marcas[0], activa: false };
      const vista = await actualizar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idProducto: producto.id,
        cambios: { precio: '20' },
      });
      expect(vista.producto.precio.aTexto()).toBe('20.00');
    });

    it('producto inexistente o eliminado → 404', async () => {
      await expect(
        actualizar.ejecutar({
          idVendedor: ID_VENDEDOR,
          idProducto: ID_MARCA_INEXISTENTE,
          cambios: { precio: '1' },
        }),
      ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    });
  });

  describe('CA-06 / PA-07: eliminar', () => {
    it('elimina de forma lógica, registra PRODUCTO_ELIMINADO y un segundo intento → 404', async () => {
      const { producto } = await nuevo();
      await eliminar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idProducto: producto.id,
      });
      expect(productos.productos).toHaveLength(1);
      expect(auditoria.acciones()).toContain('PRODUCTO_ELIMINADO');
      await expect(
        eliminar.ejecutar({ idVendedor: ID_VENDEDOR, idProducto: producto.id }),
      ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      await expect(
        new ObtenerProductoCasoUso(productos, marcas).ejecutar(
          VENDEDOR,
          producto.id,
        ),
      ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    });
  });

  describe('RF-PRO-01 / RF-CAT-03 / RF-INV-03: listar y obtener', () => {
    const paginacion = crearPaginacion();

    beforeEach(async () => {
      await nuevo({ nombre: 'Zapato', precio: '30' });
      await nuevo({
        nombre: 'Crema Ésika',
        descripcion: 'Uso diario',
        disponibilidad: 'AGOTADO',
      });
    });

    it('ordena por nombre e incluye los agotados', async () => {
      const pagina = await new ListarProductosCasoUso(
        productos,
        marcas,
      ).ejecutar(CLIENTE, { paginacion });
      expect(pagina.elementos.map((v) => v.producto.nombre)).toEqual([
        'Crema Ésika',
        'Zapato',
      ]);
      expect(pagina.total).toBe(2);
    });

    it('busca sin tildes sobre nombre y descripción, y filtra por disponibilidad', async () => {
      const listar = new ListarProductosCasoUso(productos, marcas);
      const porNombre = await listar.ejecutar(VENDEDOR, {
        clave: 'esika',
        paginacion,
      });
      expect(porNombre.total).toBe(1);
      const porDescripcion = await listar.ejecutar(VENDEDOR, {
        clave: 'diario',
        paginacion,
      });
      expect(porDescripcion.total).toBe(1);
      const agotados = await listar.ejecutar(VENDEDOR, {
        disponibilidad: 'AGOTADO',
        paginacion,
      });
      expect(agotados.elementos.map((v) => v.producto.nombre)).toEqual([
        'Crema Ésika',
      ]);
    });

    it('pagina', async () => {
      const pagina = await new ListarProductosCasoUso(
        productos,
        marcas,
      ).ejecutar(VENDEDOR, { paginacion: crearPaginacion(2, 1) });
      expect(pagina.elementos.map((v) => v.producto.nombre)).toEqual([
        'Zapato',
      ]);
      expect(pagina).toMatchObject({ pagina: 2, tamanio: 1, total: 2 });
    });

    it('RF-PRO-04: con marca inactiva el Cliente no ve sus productos y el Vendedor sí', async () => {
      marcas.marcas[0] = { ...marcas.marcas[0], activa: false };
      const listar = new ListarProductosCasoUso(productos, marcas);
      const cliente = await listar.ejecutar(CLIENTE, { paginacion });
      expect(cliente.total).toBe(0);
      expect(
        (
          await listar.ejecutar(CLIENTE, {
            marcaId: ID_MARCA_ACTIVA,
            paginacion,
          })
        ).total,
      ).toBe(0);
      expect((await listar.ejecutar(VENDEDOR, { paginacion })).total).toBe(2);
      const id = productos.productos[0].id;
      const obtener = new ObtenerProductoCasoUso(productos, marcas);
      await expect(obtener.ejecutar(CLIENTE, id)).rejects.toMatchObject({
        codigo: 'NO_ENCONTRADO',
      });
      expect((await obtener.ejecutar(VENDEDOR, id)).marca.activa).toBe(false);
    });
  });
});
