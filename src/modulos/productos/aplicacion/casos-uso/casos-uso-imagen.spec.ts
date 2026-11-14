import { Dinero } from '../../../../compartido/dominio/dinero.js';
import { Producto } from '../../dominio/producto.js';
import { AgregarImagenCasoUso } from './agregar-imagen.caso-uso.js';
import { ConsultarImagenesCasoUso } from './consultar-imagenes.caso-uso.js';
import {
  AuditoriaFalsa,
  generadorIdSecuencial,
  ID_MARCA_ACTIVA,
  ID_VENDEDOR,
  INICIO,
  ProductoRepositorioEnMemoria,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';
import {
  AlmacenImagenesEnMemoria,
  ImagenRepositorioEnMemoria,
} from './dobles-imagen.prueba-spec.js';
import { EliminarImagenCasoUso } from './eliminar-imagen.caso-uso.js';
import { ObtenerArchivoImagenCasoUso } from './obtener-archivo-imagen.caso-uso.js';
import { ReordenarImagenesCasoUso } from './reordenar-imagenes.caso-uso.js';

const ID_PRODUCTO = '00000000-0000-4000-8000-0000000000c1';
const ID_OTRO_PRODUCTO = '00000000-0000-4000-8000-0000000000c2';
const ID_INEXISTENTE = '00000000-0000-4000-8000-0000000000c9';

function conFirma(firma: number[], tamanio = 64): Uint8Array {
  const contenido = new Uint8Array(tamanio).fill(0x41);
  contenido.set(firma);
  return contenido;
}
const PNG = () => conFirma([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG = () => conFirma([0xff, 0xd8, 0xff, 0xe0]);

function producto(id: string): Producto {
  return Producto.reconstituir({
    id,
    nombre: 'Crema',
    marcaId: ID_MARCA_ACTIVA,
    precio: Dinero.desdeTexto('10.00'),
    descripcion: '',
    disponibilidad: 'DISPONIBLE',
    creadoEn: INICIO,
    actualizadoEn: INICIO,
  });
}

describe('Casos de uso de imágenes de productos (RF-PRO-01, D-46)', () => {
  let productos: ProductoRepositorioEnMemoria;
  let imagenes: ImagenRepositorioEnMemoria;
  let almacen: AlmacenImagenesEnMemoria;
  let unidad: UnidadDeTrabajoFalsa;
  let auditoria: AuditoriaFalsa;
  let agregar: AgregarImagenCasoUso;
  let reordenar: ReordenarImagenesCasoUso;
  let eliminar: EliminarImagenCasoUso;
  let consultar: ConsultarImagenesCasoUso;
  let servir: ObtenerArchivoImagenCasoUso;

  beforeEach(async () => {
    productos = new ProductoRepositorioEnMemoria();
    await productos.crear(producto(ID_PRODUCTO));
    await productos.crear(producto(ID_OTRO_PRODUCTO));
    imagenes = new ImagenRepositorioEnMemoria();
    almacen = new AlmacenImagenesEnMemoria();
    unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    agregar = new AgregarImagenCasoUso(
      productos,
      imagenes,
      almacen,
      generadorIdSecuencial(),
      new RelojFalso(),
      unidad,
      auditoria,
    );
    reordenar = new ReordenarImagenesCasoUso(productos, imagenes, unidad);
    eliminar = new EliminarImagenCasoUso(
      productos,
      imagenes,
      almacen,
      unidad,
      auditoria,
    );
    consultar = new ConsultarImagenesCasoUso(imagenes);
    servir = new ObtenerArchivoImagenCasoUso(almacen);
  });

  const subir = (contenido: Uint8Array = PNG(), idProducto = ID_PRODUCTO) =>
    agregar.ejecutar({ idVendedor: ID_VENDEDOR, idProducto, contenido });

  describe('agregar', () => {
    it('la primera imagen es la principal; las siguientes siguen en orden', async () => {
      const a = await subir(JPG());
      const b = await subir(PNG());

      expect(a).toMatchObject({ orden: 0, principal: true });
      expect(a.nombreArchivo.endsWith('.jpg')).toBe(true);
      expect(b).toMatchObject({ orden: 1, principal: false });
      expect(b.nombreArchivo.endsWith('.png')).toBe(true);
    });

    it('guarda el archivo con el nombre generado y registra IMAGEN_AGREGADA en la misma transacción', async () => {
      const a = await subir();

      expect([...almacen.archivos.keys()]).toEqual([a.nombreArchivo]);
      expect(auditoria.registradas).toHaveLength(1);
      expect(auditoria.registradas[0].enTransaccion).toBe(true);
      expect(auditoria.registradas[0].actividad).toEqual({
        accion: 'IMAGEN_AGREGADA',
        idUsuario: ID_VENDEDOR,
        entidad: 'PRODUCTO',
        idEntidad: ID_PRODUCTO,
        detalle: { idImagen: a.id },
      });
    });

    it('el tipo se decide por el contenido: un texto → TIPO_NO_ADMITIDO y no se guarda nada', async () => {
      await expect(
        subir(new TextEncoder().encode('no soy una imagen')),
      ).rejects.toMatchObject({ codigo: 'TIPO_NO_ADMITIDO' });

      expect(imagenes.imagenes).toHaveLength(0);
      expect(almacen.archivos.size).toBe(0);
      expect(auditoria.registradas).toHaveLength(0);
    });

    it('más de 2 MB → ARCHIVO_DEMASIADO_GRANDE', async () => {
      const grande = conFirma(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        2 * 1024 * 1024 + 1,
      );
      await expect(subir(grande)).rejects.toMatchObject({
        codigo: 'ARCHIVO_DEMASIADO_GRANDE',
      });
      expect(almacen.archivos.size).toBe(0);
    });

    it('la sexta imagen → LIMITE_IMAGENES', async () => {
      for (let i = 0; i < 5; i++) {
        await subir();
      }
      await expect(subir()).rejects.toMatchObject({
        codigo: 'LIMITE_IMAGENES',
      });
      expect(imagenes.imagenes).toHaveLength(5);
      expect(almacen.archivos.size).toBe(5);
    });

    it('el límite es por producto: otro producto admite sus 5', async () => {
      for (let i = 0; i < 5; i++) {
        await subir();
      }
      await expect(subir(PNG(), ID_OTRO_PRODUCTO)).resolves.toMatchObject({
        orden: 0,
      });
    });

    it('producto inexistente o eliminado → NO_ENCONTRADO', async () => {
      await expect(subir(PNG(), ID_INEXISTENTE)).rejects.toMatchObject({
        codigo: 'NO_ENCONTRADO',
      });
      await productos.marcarEliminado(ID_PRODUCTO);
      await expect(subir()).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      expect(almacen.archivos.size).toBe(0);
    });

    it('si la transacción falla al cerrarse (después de escribir el archivo), el archivo se borra', async () => {
      const cierreFallido = {
        async ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
          await trabajo();
          throw new Error('el cierre de la transacción falló');
        },
      };
      const agregarConFallo = new AgregarImagenCasoUso(
        productos,
        imagenes,
        almacen,
        generadorIdSecuencial(),
        new RelojFalso(),
        cierreFallido,
        auditoria,
      );

      await expect(
        agregarConFallo.ejecutar({
          idVendedor: ID_VENDEDOR,
          idProducto: ID_PRODUCTO,
          contenido: PNG(),
        }),
      ).rejects.toThrow('el cierre de la transacción falló');

      expect(almacen.archivos.size).toBe(0);
    });

    it('si falla el registro en la base o en la bitácora, no se escribe ningún archivo', async () => {
      imagenes.falloAlInsertar = new Error('fallo de la base');
      await expect(subir()).rejects.toThrow('fallo de la base');
      imagenes.falloAlInsertar = undefined;
      auditoria.fallo = new Error('bitácora caída');
      await expect(subir()).rejects.toThrow('bitácora caída');
      expect(almacen.archivos.size).toBe(0);
    });

    it('si falla la escritura del archivo, falla la operación sin dejar archivo', async () => {
      almacen.falloAlGuardar = new Error('disco lleno');
      await expect(subir()).rejects.toThrow('disco lleno');
      expect(almacen.archivos.size).toBe(0);
    });
  });

  describe('reordenar', () => {
    it('cambia el orden y la principal', async () => {
      const a = await subir(JPG());
      const b = await subir(PNG());

      const resultado = await reordenar.ejecutar({
        idProducto: ID_PRODUCTO,
        ids: [b.id, a.id],
      });

      expect(resultado.map((i) => [i.id, i.orden, i.principal])).toEqual([
        [b.id, 0, true],
        [a.id, 1, false],
      ]);
    });

    it('ids incompletos o ajenos → DATOS_INVALIDOS y no cambia nada', async () => {
      const a = await subir();
      const b = await subir();
      const ajena = await subir(PNG(), ID_OTRO_PRODUCTO);

      for (const ids of [[a.id], [a.id, b.id, ajena.id], [a.id, a.id]]) {
        await expect(
          reordenar.ejecutar({ idProducto: ID_PRODUCTO, ids }),
        ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
      }
      expect(
        (await imagenes.listarPorProducto(ID_PRODUCTO)).map((i) => i.id),
      ).toEqual([a.id, b.id]);
    });

    it('producto inexistente → NO_ENCONTRADO', async () => {
      await expect(
        reordenar.ejecutar({ idProducto: ID_INEXISTENTE, ids: [] }),
      ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    });
  });

  describe('eliminar', () => {
    it('borra la fila y el archivo, reasigna la principal y registra IMAGEN_ELIMINADA', async () => {
      const a = await subir(JPG());
      const b = await subir(PNG());
      auditoria.registradas.length = 0;

      await eliminar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idProducto: ID_PRODUCTO,
        idImagen: a.id,
      });

      expect([...almacen.archivos.keys()]).toEqual([b.nombreArchivo]);
      const restantes = await imagenes.listarPorProducto(ID_PRODUCTO);
      expect(restantes.map((i) => [i.id, i.orden])).toEqual([[b.id, 0]]);
      expect(auditoria.registradas).toHaveLength(1);
      expect(auditoria.registradas[0].enTransaccion).toBe(true);
      expect(auditoria.registradas[0].actividad).toMatchObject({
        accion: 'IMAGEN_ELIMINADA',
        entidad: 'PRODUCTO',
        idEntidad: ID_PRODUCTO,
        detalle: { idImagen: a.id },
      });
    });

    it('si la transacción falla, el archivo se conserva', async () => {
      const a = await subir();
      auditoria.fallo = new Error('bitácora caída');

      await expect(
        eliminar.ejecutar({
          idVendedor: ID_VENDEDOR,
          idProducto: ID_PRODUCTO,
          idImagen: a.id,
        }),
      ).rejects.toThrow('bitácora caída');

      expect(almacen.archivos.has(a.nombreArchivo)).toBe(true);
    });

    it('imagen inexistente, de otro producto o producto inexistente → NO_ENCONTRADO', async () => {
      const ajena = await subir(PNG(), ID_OTRO_PRODUCTO);
      const a = await subir();

      for (const [idProducto, idImagen] of [
        [ID_PRODUCTO, ID_INEXISTENTE],
        [ID_PRODUCTO, ajena.id],
        [ID_INEXISTENTE, a.id],
      ]) {
        await expect(
          eliminar.ejecutar({ idVendedor: ID_VENDEDOR, idProducto, idImagen }),
        ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      }
      expect(almacen.archivos.size).toBe(2);
    });
  });

  describe('consultar y servir', () => {
    it('consultar devuelve un mapa con todos los productos pedidos y sus imágenes ordenadas', async () => {
      const a = await subir(JPG());
      const b = await subir(PNG());
      await reordenar.ejecutar({ idProducto: ID_PRODUCTO, ids: [b.id, a.id] });

      const mapa = await consultar.porProductos([
        ID_PRODUCTO,
        ID_OTRO_PRODUCTO,
      ]);

      expect(mapa.get(ID_PRODUCTO)?.map((i) => i.id)).toEqual([b.id, a.id]);
      expect(mapa.get(ID_OTRO_PRODUCTO)).toEqual([]);
      expect((await consultar.porProductos([])).size).toBe(0);
    });

    it('servir devuelve el contenido y el tipo; un nombre inválido o inexistente → NO_ENCONTRADO', async () => {
      const a = await subir(JPG());

      const archivo = await servir.ejecutar(a.nombreArchivo);
      expect(archivo.tipo).toBe('jpg');
      expect(archivo.contenido).toEqual(JPG());

      for (const nombre of [
        '../secreto.jpg',
        `${ID_INEXISTENTE}.jpg`,
        'foto.png',
        '',
      ]) {
        await expect(servir.ejecutar(nombre)).rejects.toMatchObject({
          codigo: 'NO_ENCONTRADO',
        });
      }
    });
  });
});
