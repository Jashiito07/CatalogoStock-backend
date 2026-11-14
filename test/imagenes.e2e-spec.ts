import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la subfase 2.4 (RF-PRO-01, CA-02, RNF-03, D-46; contrato de productos,
 * «Endpoints: imágenes» y «Pruebas mínimas») contra `catalogostock_pruebas`
 * (D-23). Los archivos se escriben en una carpeta TEMPORAL del sistema
 * (`RUTA_ALMACENAMIENTO` de las pruebas), nunca en la de desarrollo. Datos ficticios.
 */

const RUTA = '/api/v1/productos';
const RUTA_IMAGENES = '/api/v1/imagenes';
const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const CORREO_CLIENTE = 'maria.zambrano@ejemplo.test';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000999';
const DOS_MB = 2 * 1024 * 1024;

const FORMATO_URL =
  /^\/api\/v1\/imagenes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Carpetas de imágenes de las pruebas: siempre dentro de la carpeta temporal. */
const RAIZ_ALMACENAMIENTO = resolve(process.env.RUTA_ALMACENAMIENTO ?? '');
const CARPETA_IMAGENES = join(RAIZ_ALMACENAMIENTO, 'productos');

/** Relleno tras la firma: solo importa el inicio del archivo (tipo real por bytes). */
function conRelleno(firma: number[], tamanio = 64): Buffer {
  const contenido = Buffer.alloc(tamanio, 0x41);
  Buffer.from(firma).copy(contenido);
  return contenido;
}

const jpg = (tamanio?: number) => conRelleno([0xff, 0xd8, 0xff, 0xe0], tamanio);
const png = (tamanio?: number) =>
  conRelleno([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], tamanio);
const webp = (tamanio?: number) =>
  conRelleno(
    [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
    tamanio,
  );

interface CuerpoSesion {
  tokenAcceso: string;
}

interface CuerpoImagen {
  id: string;
  url: string;
  orden: number;
  principal: boolean;
}

interface CuerpoProducto {
  id: string;
  imagenes: CuerpoImagen[];
}

interface FilaAuditoria {
  accion: string;
  id_usuario: string | null;
  entidad: string | null;
  id_entidad: string | null;
  detalle: Record<string, unknown>;
}

function conToken<T extends { set(c: string, v: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

const nombreEnDisco = (imagen: CuerpoImagen): string =>
  imagen.url.slice(imagen.url.lastIndexOf('/') + 1);

/** Archivos que hay ahora en la carpeta de imágenes de pruebas. */
async function archivosEnDisco(): Promise<string[]> {
  try {
    return (await readdir(CARPETA_IMAGENES)).toSorted();
  } catch {
    return [];
  }
}

describe('Subfase 2.4 (e2e): imágenes de productos (RF-PRO-01, D-46)', () => {
  let contexto: AppPruebas;
  let vendedor: CuerpoSesion;
  let cliente: CuerpoSesion;
  let marcaId: string;

  const http = () => request(contexto.app.getHttpServer());
  const comoVendedor = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, vendedor.tokenAcceso);
  const comoCliente = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, cliente.tokenAcceso);

  const ingresar = (
    canal: 'cliente' | 'vendedor',
    correo: string,
    clave: string,
  ) =>
    http()
      .post(`/api/v1/autenticacion/ingreso/${canal}`)
      .send({ correo, clave });

  const crearProducto = async (nombre = 'Crema de prueba'): Promise<string> =>
    (
      await comoVendedor(http().post(RUTA))
        .send({ nombre, marcaId, precio: '10.00' })
        .expect(201)
    ).body.id as string;

  const subir = (
    idProducto: string,
    contenido: Buffer,
    nombre = 'foto.png',
    tipo = 'image/png',
  ) =>
    comoVendedor(http().post(`${RUTA}/${idProducto}/imagenes`)).attach(
      'archivo',
      contenido,
      { filename: nombre, contentType: tipo },
    );

  const subirOk = async (
    idProducto: string,
    contenido: Buffer = png(),
  ): Promise<CuerpoImagen> =>
    (await subir(idProducto, contenido).expect(201)).body as CuerpoImagen;

  const obtenerProducto = async (id: string): Promise<CuerpoProducto> =>
    (await comoVendedor(http().get(`${RUTA}/${id}`)).expect(200))
      .body as CuerpoProducto;

  const borrar = (idProducto: string, idImagen: string) =>
    comoVendedor(http().delete(`${RUTA}/${idProducto}/imagenes/${idImagen}`));

  async function filasImagenes(): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      'SELECT count(*) AS total FROM imagenes_producto',
    );
    return Number(total);
  }

  async function auditoria(accion: string): Promise<FilaAuditoria[]> {
    return contexto.fuente.query<FilaAuditoria[]>(
      `SELECT accion, id_usuario, entidad, id_entidad, detalle FROM auditoria
       WHERE accion = $1 ORDER BY fecha, id`,
      [accion],
    );
  }

  beforeAll(async () => {
    // Defensa: las pruebas solo pueden escribir bajo la carpeta temporal.
    if (!RAIZ_ALMACENAMIENTO.startsWith(resolve(tmpdir()))) {
      throw new Error('RUTA_ALMACENAMIENTO de las pruebas debe ser temporal.');
    }
    contexto = await crearAppPruebas();
  });

  beforeEach(async () => {
    await rm(RAIZ_ALMACENAMIENTO, { recursive: true, force: true });
    await contexto.limpiar();
    const resultado = await contexto.app.get(CrearVendedorCasoUso).ejecutar({
      nombre: 'Vendedor de Prueba',
      correo: CORREO_VENDEDOR,
      telefono: '0987654321',
      clave: CLAVE_VENDEDOR,
    });
    if (!resultado.creado) {
      throw new Error('No se creó el Vendedor de prueba');
    }
    await http()
      .post('/api/v1/usuarios/registro')
      .send({
        nombre: 'María Zambrano',
        correo: CORREO_CLIENTE,
        telefono: '0991234567',
        clave: CLAVE,
        aceptaPrivacidad: true,
        versionPrivacidad: VERSION_AVISO,
      })
      .expect(201);
    vendedor = (
      await ingresar('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR).expect(200)
    ).body as CuerpoSesion;
    cliente = (await ingresar('cliente', CORREO_CLIENTE, CLAVE).expect(200))
      .body as CuerpoSesion;
    marcaId = (
      await comoVendedor(http().post('/api/v1/marcas'))
        .send({ nombre: 'Avon', color: '#2563EB' })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await rm(RAIZ_ALMACENAMIENTO, { recursive: true, force: true });
    await contexto?.cerrar();
  });

  describe('POST /productos/{id}/imagenes', () => {
    it('D-46: JPG, PNG y WebP válidos → 201 con el formato del contrato; la primera es la principal', async () => {
      const id = await crearProducto();

      const primera = (
        await subir(id, jpg(), 'a.jpg', 'image/jpeg').expect(201)
      ).body as CuerpoImagen;
      const segunda = await subirOk(id, png());
      const tercera = (
        await subir(id, webp(), 'c.webp', 'image/webp').expect(201)
      ).body as CuerpoImagen;

      expect(primera).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        url: expect.stringMatching(FORMATO_URL),
        orden: 0,
        principal: true,
      });
      expect(primera.url.endsWith('.jpg')).toBe(true);
      expect(segunda).toMatchObject({ orden: 1, principal: false });
      expect(segunda.url.endsWith('.png')).toBe(true);
      expect(tercera).toMatchObject({ orden: 2, principal: false });
      expect(tercera.url.endsWith('.webp')).toBe(true);
    });

    it('D-46: el nombre en disco es un UUID generado por el servidor, nunca el original', async () => {
      const id = await crearProducto();

      const imagen = (
        await subir(id, png(), '../../etc/pasaporte-juan.png').expect(201)
      ).body as CuerpoImagen;

      expect(await archivosEnDisco()).toEqual([nombreEnDisco(imagen)]);
      expect(nombreEnDisco(imagen)).toMatch(/^[0-9a-f-]{36}\.png$/);
      const [{ ruta_relativa: ruta }] = await contexto.fuente.query<
        { ruta_relativa: string }[]
      >('SELECT ruta_relativa FROM imagenes_producto');
      // Ruta relativa a la carpeta de almacenamiento: nunca la ruta del servidor.
      expect(ruta).toBe(`productos/${nombreEnDisco(imagen)}`);
      const guardado = await readFile(
        join(CARPETA_IMAGENES, nombreEnDisco(imagen)),
      );
      expect(guardado.equals(png())).toBe(true);
    });

    it('D-46: un .png que en realidad es texto → 415 TIPO_NO_ADMITIDO; no queda archivo ni fila', async () => {
      const id = await crearProducto();

      const respuesta = await subir(
        id,
        Buffer.from('esto no es una imagen, solo texto'),
        'falsa.png',
        'image/png',
      ).expect(415);

      expect(respuesta.body.codigo).toBe('TIPO_NO_ADMITIDO');
      expect(await archivosEnDisco()).toEqual([]);
      expect(await filasImagenes()).toBe(0);
    });

    it('D-46: un ejecutable o un SVG con extensión y tipo falsos → 415', async () => {
      const id = await crearProducto();

      await subir(
        id,
        Buffer.from('MZ\x90\x00 programa'),
        'logo.jpg',
        'image/jpeg',
      ).expect(415);
      await subir(
        id,
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'logo.webp',
        'image/webp',
      ).expect(415);
      // RIFF sin la marca WEBP (por ejemplo un WAV) tampoco es WebP.
      await subir(
        id,
        conRelleno([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
        ]),
        'audio.webp',
        'image/webp',
      ).expect(415);

      expect(await filasImagenes()).toBe(0);
    });

    it('D-46: un archivo de 3 MB → 413 ARCHIVO_DEMASIADO_GRANDE; uno de exactamente 2 MB se acepta', async () => {
      const id = await crearProducto();

      const respuesta = await subir(id, png(3 * 1024 * 1024)).expect(413);

      expect(respuesta.body.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
      expect(await filasImagenes()).toBe(0);
      expect(await archivosEnDisco()).toEqual([]);

      await subir(id, png(DOS_MB)).expect(201);
      expect(await filasImagenes()).toBe(1);
    });

    it('D-46: la sexta imagen → 422 LIMITE_IMAGENES y no se guarda', async () => {
      const id = await crearProducto();
      for (let i = 0; i < 5; i++) {
        await subirOk(id);
      }

      const respuesta = await subir(id, png()).expect(422);

      expect(respuesta.body.codigo).toBe('LIMITE_IMAGENES');
      expect(await filasImagenes()).toBe(5);
      expect(await archivosEnDisco()).toHaveLength(5);
    });

    it('D-46: siete subidas simultáneas del mismo producto → exactamente 5 aceptadas y 2 con 422', async () => {
      const id = await crearProducto();

      const respuestas = await Promise.all(
        Array.from({ length: 7 }, () => subir(id, png())),
      );

      const estados = respuestas.map((r) => r.status).toSorted();
      expect(estados).toEqual([201, 201, 201, 201, 201, 422, 422]);
      expect(await filasImagenes()).toBe(5);
      expect(await archivosEnDisco()).toHaveLength(5);
      const imagenes = (await obtenerProducto(id)).imagenes;
      expect(imagenes.map((i) => i.orden)).toEqual([0, 1, 2, 3, 4]);
    });

    it('RNF-03: sin el campo archivo → 400; con otro campo de texto → 400; id no UUID → 400', async () => {
      const id = await crearProducto();

      await comoVendedor(http().post(`${RUTA}/${id}/imagenes`))
        .field('nota', 'hola')
        .expect(400);
      await comoVendedor(http().post(`${RUTA}/${id}/imagenes`))
        .send({})
        .expect(400);
      await comoVendedor(http().post(`${RUTA}/${id}/imagenes`))
        .attach('otro', png(), { filename: 'x.png', contentType: 'image/png' })
        .expect(400);
      const respuesta = await subir('no-es-uuid', png()).expect(400);

      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      expect(await filasImagenes()).toBe(0);
    });

    it('producto inexistente o eliminado → 404 NO_ENCONTRADO y no se guarda nada', async () => {
      const id = await crearProducto();
      await comoVendedor(http().delete(`${RUTA}/${id}`)).expect(204);

      const inexistente = await subir(ID_INEXISTENTE, png()).expect(404);
      await subir(id, png()).expect(404);

      expect(inexistente.body.codigo).toBe('NO_ENCONTRADO');
      expect(await filasImagenes()).toBe(0);
      expect(await archivosEnDisco()).toEqual([]);
    });

    it('CA-02: el Cliente → 403 en las tres rutas de escritura, queda ACCESO_DENEGADO y nada cambia', async () => {
      const id = await crearProducto();
      const imagen = await subirOk(id);
      const archivos = await archivosEnDisco();

      const subida = await comoCliente(
        http().post(`${RUTA}/${id}/imagenes`),
      ).attach('archivo', png(), {
        filename: 'x.png',
        contentType: 'image/png',
      });
      const orden = await comoCliente(
        http().put(`${RUTA}/${id}/imagenes/orden`),
      ).send({ ids: [imagen.id] });
      const baja = await comoCliente(
        http().delete(`${RUTA}/${id}/imagenes/${imagen.id}`),
      );

      for (const respuesta of [subida, orden, baja]) {
        expect(respuesta.status).toBe(403);
        expect(respuesta.body.codigo).toBe('NO_AUTORIZADO');
      }
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(3);
      expect(await filasImagenes()).toBe(1);
      expect(await archivosEnDisco()).toEqual(archivos);
    });

    it('sin sesión → 401 en las tres rutas de escritura', async () => {
      const id = await crearProducto();
      const imagen = await subirOk(id);

      await http()
        .post(`${RUTA}/${id}/imagenes`)
        .attach('archivo', png(), {
          filename: 'x.png',
          contentType: 'image/png',
        })
        .expect(401);
      await http()
        .put(`${RUTA}/${id}/imagenes/orden`)
        .send({ ids: [imagen.id] })
        .expect(401);
      await http().delete(`${RUTA}/${id}/imagenes/${imagen.id}`).expect(401);
    });

    it('RF-PRO-01: IMAGEN_AGREGADA en la bitácora con solo el id de la imagen (sin rutas ni nombres)', async () => {
      const id = await crearProducto();

      const imagen = (await subir(id, png(), 'mi-foto.png').expect(201))
        .body as CuerpoImagen;

      const filas = await auditoria('IMAGEN_AGREGADA');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        entidad: 'PRODUCTO',
        id_entidad: id,
        detalle: { idImagen: imagen.id },
      });
      expect(JSON.stringify(filas[0].detalle)).not.toContain('almacenamiento');
      expect(JSON.stringify(filas[0].detalle)).not.toContain('mi-foto');
    });
  });

  describe('imágenes dentro del producto', () => {
    it('RF-PRO-01: GET /productos/{id} y el listado traen `imagenes` ordenadas; el Cliente también las ve', async () => {
      const id = await crearProducto();
      const sinImagenes = await crearProducto('Sin fotos');
      const a = await subirOk(id, jpg());
      const b = await subirOk(id, png());

      const detalle = await obtenerProducto(id);
      const lista = await comoCliente(http().get(RUTA)).expect(200);
      const detalleCliente = await comoCliente(
        http().get(`${RUTA}/${id}`),
      ).expect(200);

      expect(detalle.imagenes).toEqual([a, b]);
      expect(detalleCliente.body.imagenes).toEqual([a, b]);
      const porId = new Map(
        (lista.body.elementos as CuerpoProducto[]).map((p) => [p.id, p]),
      );
      expect(porId.get(id)?.imagenes).toEqual([a, b]);
      expect(porId.get(sinImagenes)?.imagenes).toEqual([]);
    });

    it('PATCH /productos/{id} devuelve también las imágenes', async () => {
      const id = await crearProducto();
      const a = await subirOk(id);

      const respuesta = await comoVendedor(http().patch(`${RUTA}/${id}`))
        .send({ precio: '11.00' })
        .expect(200);

      expect(respuesta.body.imagenes).toEqual([a]);
    });
  });

  describe('PUT /productos/{id}/imagenes/orden', () => {
    it('reordena y elige la principal: la primera de la lista queda con orden 0', async () => {
      const id = await crearProducto();
      const a = await subirOk(id, jpg());
      const b = await subirOk(id, png());
      const c = await subirOk(id, webp());

      const respuesta = await comoVendedor(
        http().put(`${RUTA}/${id}/imagenes/orden`),
      )
        .send({ ids: [c.id, a.id, b.id] })
        .expect(200);

      expect(respuesta.body).toEqual([
        { ...c, orden: 0, principal: true },
        { ...a, orden: 1, principal: false },
        { ...b, orden: 2, principal: false },
      ]);
      expect((await obtenerProducto(id)).imagenes.map((i) => i.id)).toEqual([
        c.id,
        a.id,
        b.id,
      ]);
    });

    it('faltan, sobran o se repiten ids → 400 DATOS_INVALIDOS y el orden no cambia', async () => {
      const id = await crearProducto();
      const otro = await crearProducto('Otro producto');
      const a = await subirOk(id);
      const b = await subirOk(id);
      const ajena = await subirOk(otro);
      const enviar = (ids: unknown) =>
        comoVendedor(http().put(`${RUTA}/${id}/imagenes/orden`)).send({ ids });

      for (const ids of [
        [b.id],
        [],
        [a.id, b.id, ajena.id],
        [b.id, ajena.id],
        [a.id, a.id],
        [a.id, b.id, ID_INEXISTENTE],
      ]) {
        const respuesta = await enviar(ids).expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      }
      await enviar('no-es-lista').expect(400);
      await enviar(['no-uuid', a.id]).expect(400);
      await comoVendedor(http().put(`${RUTA}/${id}/imagenes/orden`))
        .send({ ids: [b.id, a.id], extra: 1 })
        .expect(400);

      expect((await obtenerProducto(id)).imagenes.map((i) => i.id)).toEqual([
        a.id,
        b.id,
      ]);
    });

    it('producto inexistente → 404', async () => {
      await comoVendedor(http().put(`${RUTA}/${ID_INEXISTENTE}/imagenes/orden`))
        .send({ ids: [] })
        .expect(404);
    });
  });

  describe('DELETE /productos/{id}/imagenes/{imagenId}', () => {
    it('RF-PRO-01: 204, borra la fila y el archivo del disco y reasigna la principal', async () => {
      const id = await crearProducto();
      const a = await subirOk(id, jpg());
      const b = await subirOk(id, png());
      const c = await subirOk(id, webp());
      expect(await archivosEnDisco()).toContain(nombreEnDisco(a));

      await comoVendedor(
        http().delete(`${RUTA}/${id}/imagenes/${a.id}`),
      ).expect(204);

      expect(await archivosEnDisco()).toEqual(
        [nombreEnDisco(b), nombreEnDisco(c)].toSorted(),
      );
      expect(await filasImagenes()).toBe(2);
      expect((await obtenerProducto(id)).imagenes).toEqual([
        { ...b, orden: 0, principal: true },
        { ...c, orden: 1, principal: false },
      ]);
      // La imagen borrada ya no se sirve.
      await http()
        .get(`${RUTA_IMAGENES}/${nombreEnDisco(a)}`)
        .expect(404);
    });

    it('tras eliminar quedan cupos: se puede subir otra al llegar a 5', async () => {
      const id = await crearProducto();
      const primera = await subirOk(id);
      for (let i = 0; i < 4; i++) {
        await subirOk(id);
      }
      await subir(id, png()).expect(422);

      await comoVendedor(
        http().delete(`${RUTA}/${id}/imagenes/${primera.id}`),
      ).expect(204);
      const nueva = await subirOk(id);

      expect(nueva).toMatchObject({ orden: 4, principal: false });
    });

    it('registra IMAGEN_ELIMINADA con el id de la imagen', async () => {
      const id = await crearProducto();
      const a = await subirOk(id);

      await comoVendedor(
        http().delete(`${RUTA}/${id}/imagenes/${a.id}`),
      ).expect(204);

      const filas = await auditoria('IMAGEN_ELIMINADA');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        entidad: 'PRODUCTO',
        id_entidad: id,
        detalle: { idImagen: a.id },
      });
    });

    it('404: imagen inexistente, ya eliminada, de otro producto o producto inexistente; id no UUID → 400', async () => {
      const id = await crearProducto();
      const otro = await crearProducto('Otro producto');
      const a = await subirOk(id);
      const ajena = await subirOk(otro);

      await borrar(id, ID_INEXISTENTE).expect(404);
      await borrar(id, ajena.id).expect(404);
      await borrar(ID_INEXISTENTE, a.id).expect(404);
      await borrar(id, 'no-uuid').expect(400);
      await borrar(id, a.id).expect(204);
      await borrar(id, a.id).expect(404);

      // La imagen del otro producto sigue intacta, en la base y en el disco.
      expect((await obtenerProducto(otro)).imagenes).toEqual([ajena]);
      expect(await archivosEnDisco()).toEqual([nombreEnDisco(ajena)]);
    });
  });

  describe('eliminación lógica del producto (PA-07)', () => {
    it('eliminar el producto conserva sus filas y sus archivos de imagen', async () => {
      const id = await crearProducto();
      await subirOk(id);
      await subirOk(id);
      const archivos = await archivosEnDisco();

      await comoVendedor(http().delete(`${RUTA}/${id}`)).expect(204);

      expect(await filasImagenes()).toBe(2);
      expect(await archivosEnDisco()).toEqual(archivos);
    });
  });

  describe('GET /imagenes/{archivo} (público)', () => {
    it('D-46: sin sesión → 200 con el archivo, Content-Type correcto y caché inmutable', async () => {
      const id = await crearProducto();
      const imagen = await subirOk(id, png());

      const respuesta = await http().get(imagen.url).expect(200);

      expect(respuesta.headers['content-type']).toBe('image/png');
      expect(respuesta.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['cross-origin-resource-policy']).toBe(
        'cross-origin',
      );
      expect((respuesta.body as Buffer).equals(png())).toBe(true);
    });

    it('sirve JPG y WebP con su propio Content-Type', async () => {
      const id = await crearProducto();
      const a = (await subir(id, jpg(), 'a.jpg', 'image/jpeg').expect(201))
        .body as CuerpoImagen;
      const b = (await subir(id, webp(), 'b.webp', 'image/webp').expect(201))
        .body as CuerpoImagen;

      expect(
        (await http().get(a.url).expect(200)).headers['content-type'],
      ).toBe('image/jpeg');
      expect(
        (await http().get(b.url).expect(200)).headers['content-type'],
      ).toBe('image/webp');
    });

    it('D-46: `../`, nombres inválidos, otras extensiones o un UUID inexistente → 404; la carpeta no se lista', async () => {
      const id = await crearProducto();
      const imagen = await subirOk(id);
      const uuid = nombreEnDisco(imagen).replace('.png', '');
      // Archivo ajeno junto a las imágenes: tampoco debe poder leerse.
      await mkdir(CARPETA_IMAGENES, { recursive: true });

      const rutas = [
        `${RUTA_IMAGENES}/..%2F..%2F.env`,
        `${RUTA_IMAGENES}/..%2Fproductos%2F${uuid}.png`,
        `${RUTA_IMAGENES}/%2e%2e%2f%2e%2e%2fpackage.json`,
        `${RUTA_IMAGENES}/${uuid}.gif`,
        `${RUTA_IMAGENES}/${uuid}.png%00.jpg`,
        `${RUTA_IMAGENES}/${uuid}`,
        `${RUTA_IMAGENES}/${uuid.toUpperCase()}.png`,
        `${RUTA_IMAGENES}/foto.png`,
        `${RUTA_IMAGENES}/${ID_INEXISTENTE}.png`,
        `${RUTA_IMAGENES}/${ID_INEXISTENTE}.jpg`,
        `${RUTA_IMAGENES}/`,
        RUTA_IMAGENES,
        `${RUTA_IMAGENES}/productos`,
      ];
      for (const ruta of rutas) {
        const respuesta = await http().get(ruta);
        expect([ruta, respuesta.status]).toEqual([ruta, 404]);
      }
    });
  });
});
