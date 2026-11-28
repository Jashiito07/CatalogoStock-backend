import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la subfase 2.4 (RF-PRO-01, CA-02, RNF-03, D-46; contrato de productos,
 * «Endpoints: imágenes» y «Pruebas mínimas») contra `catalogostock_pruebas`
 * (D-23). Los archivos se escriben en una carpeta TEMPORAL del sistema
 * (`RUTA_ALMACENAMIENTO` de las pruebas), nunca en la de desarrollo. Datos ficticios.
 *
 * DEC-06: cada subida se vuelve a codificar en JPEG (detalle de 800 px y
 * miniatura de 320 px, `<uuid>.jpg` y `<uuid>-m.jpg`), sin metadatos EXIF. Por eso
 * las pruebas suben imágenes reales (generadas con `@napi-rs/canvas`).
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
  /^\/api\/v1\/imagenes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const FORMATO_URL_MINIATURA =
  /^\/api\/v1\/imagenes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-m\.jpg$/;

/** Carpetas de imágenes de las pruebas: siempre dentro de la carpeta temporal. */
const RAIZ_ALMACENAMIENTO = resolve(process.env.RUTA_ALMACENAMIENTO ?? '');
const CARPETA_IMAGENES = join(RAIZ_ALMACENAMIENTO, 'productos');

/** Relleno tras la firma: solo importa el inicio del archivo (tipo real por bytes). */
function conRelleno(firma: number[], tamanio = 64): Buffer {
  const contenido = Buffer.alloc(tamanio, 0x41);
  Buffer.from(firma).copy(contenido);
  return contenido;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Imagen real de dos colores (izquierda roja, derecha azul). */
async function imagenReal(
  formato: 'png' | 'jpeg' | 'webp',
  ancho = 1200,
  alto = 900,
): Promise<Buffer> {
  const lienzo = createCanvas(ancho, alto);
  const contexto = lienzo.getContext('2d');
  contexto.fillStyle = '#FF0000';
  contexto.fillRect(0, 0, ancho / 2, alto);
  contexto.fillStyle = '#0000FF';
  contexto.fillRect(ancho / 2, 0, ancho / 2, alto);
  return formato === 'png' ? lienzo.encode('png') : lienzo.encode(formato, 90);
}

const REALES: { jpg: Buffer; png: Buffer; webp: Buffer } = {
  jpg: Buffer.alloc(0),
  png: Buffer.alloc(0),
  webp: Buffer.alloc(0),
};

/**
 * Imagen real de 1200×900; con `tamanio`, la misma rellenada con ceros al
 * final hasta ese tamaño (los decodificadores ignoran lo que sigue a la imagen).
 */
const conTamanio = (imagen: Buffer, tamanio?: number) =>
  tamanio === undefined
    ? Buffer.from(imagen)
    : Buffer.concat([imagen, Buffer.alloc(tamanio - imagen.length)]);
const jpg = (tamanio?: number) => conTamanio(REALES.jpg, tamanio);
const png = (tamanio?: number) => conTamanio(REALES.png, tamanio);
const webp = (tamanio?: number) => conTamanio(REALES.webp, tamanio);

/** Inserta un EXIF (orientación y una descripción con «GPS») tras el SOI. */
function conExif(jpeg: Buffer, orientacion: number, texto: string): Buffer {
  const ascii = Buffer.from(`${texto}\0`, 'latin1');
  const tiff = Buffer.alloc(38);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientacion, 18);
  tiff.writeUInt16LE(0x010e, 22);
  tiff.writeUInt16LE(2, 24);
  tiff.writeUInt32LE(ascii.length, 26);
  tiff.writeUInt32LE(tiff.length, 30);
  const datos = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, ascii]);
  const segmento = Buffer.alloc(4);
  segmento.writeUInt16BE(0xffe1, 0);
  segmento.writeUInt16BE(datos.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), segmento, datos, jpeg.subarray(2)]);
}

async function dimensionesDe(contenido: Buffer): Promise<[number, number]> {
  const imagen = await loadImage(contenido);
  return [imagen.width, imagen.height];
}

interface CuerpoSesion {
  tokenAcceso: string;
}

interface CuerpoImagen {
  id: string;
  url: string;
  urlMiniatura: string;
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
const miniaturaEnDisco = (imagen: CuerpoImagen): string =>
  imagen.urlMiniatura.slice(imagen.urlMiniatura.lastIndexOf('/') + 1);
/** Los dos archivos de una imagen (detalle y miniatura), ordenados. */
const archivosDe = (...imagenes: CuerpoImagen[]): string[] =>
  imagenes.flatMap((i) => [nombreEnDisco(i), miniaturaEnDisco(i)]).toSorted();

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
    REALES.jpg = await imagenReal('jpeg');
    REALES.png = await imagenReal('png');
    REALES.webp = await imagenReal('webp');
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
    it('D-46, DEC-06: JPG, PNG y WebP válidos → 201 con el formato del contrato; todo se guarda en JPEG; la primera es la principal', async () => {
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
        urlMiniatura: expect.stringMatching(FORMATO_URL_MINIATURA),
        orden: 0,
        principal: true,
      });
      expect(primera.urlMiniatura).toBe(primera.url.replace('.jpg', '-m.jpg'));
      expect(segunda).toMatchObject({ orden: 1, principal: false });
      expect(segunda.url).toMatch(FORMATO_URL);
      expect(tercera).toMatchObject({ orden: 2, principal: false });
      expect(tercera.url).toMatch(FORMATO_URL);
    });

    it('D-46: el nombre en disco es un UUID generado por el servidor, nunca el original', async () => {
      const id = await crearProducto();

      const imagen = (
        await subir(id, png(), '../../etc/pasaporte-juan.png').expect(201)
      ).body as CuerpoImagen;

      expect(await archivosEnDisco()).toEqual(archivosDe(imagen));
      expect(nombreEnDisco(imagen)).toMatch(/^[0-9a-f-]{36}\.jpg$/);
      const [fila] = await contexto.fuente.query<
        { ruta_relativa: string; ruta_miniatura: string }[]
      >('SELECT ruta_relativa, ruta_miniatura FROM imagenes_producto');
      // Rutas relativas a la carpeta de almacenamiento: nunca la ruta del servidor.
      expect(fila.ruta_relativa).toBe(`productos/${nombreEnDisco(imagen)}`);
      expect(fila.ruta_miniatura).toBe(`productos/${miniaturaEnDisco(imagen)}`);
      // DEC-06: nunca se guarda el archivo original.
      const guardado = await readFile(
        join(CARPETA_IMAGENES, nombreEnDisco(imagen)),
      );
      expect(guardado.equals(png())).toBe(false);
      expect(guardado.subarray(0, 3).toString('hex')).toBe('ffd8ff');
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
      expect(await archivosEnDisco()).toHaveLength(10);
    });

    it('D-46: siete subidas simultáneas del mismo producto → exactamente 5 aceptadas y 2 con 422', async () => {
      const id = await crearProducto();

      const respuestas = await Promise.all(
        Array.from({ length: 7 }, () => subir(id, png())),
      );

      const estados = respuestas.map((r) => r.status).toSorted();
      expect(estados).toEqual([201, 201, 201, 201, 201, 422, 422]);
      expect(await filasImagenes()).toBe(5);
      expect(await archivosEnDisco()).toHaveLength(10);
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

      // DEC-06: se borran el detalle y la miniatura.
      expect(await archivosEnDisco()).toEqual(archivosDe(b, c));
      expect(await filasImagenes()).toBe(2);
      expect((await obtenerProducto(id)).imagenes).toEqual([
        { ...b, orden: 0, principal: true },
        { ...c, orden: 1, principal: false },
      ]);
      // La imagen borrada ya no se sirve, ni su miniatura.
      await http()
        .get(`${RUTA_IMAGENES}/${nombreEnDisco(a)}`)
        .expect(404);
      await http().get(a.urlMiniatura).expect(404);
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
      expect(await archivosEnDisco()).toEqual(archivosDe(ajena));
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

      expect(respuesta.headers['content-type']).toBe('image/jpeg');
      expect(respuesta.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['cross-origin-resource-policy']).toBe(
        'cross-origin',
      );
      expect(
        (respuesta.body as Buffer).equals(
          await readFile(join(CARPETA_IMAGENES, nombreEnDisco(imagen))),
        ),
      ).toBe(true);

      // DEC-06: la miniatura se sirve igual (pública, JPEG, caché inmutable).
      const miniatura = await http().get(imagen.urlMiniatura).expect(200);
      expect(miniatura.headers['content-type']).toBe('image/jpeg');
      expect(miniatura.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
      expect(miniatura.headers['x-content-type-options']).toBe('nosniff');
    });

    it('las imágenes anteriores a DEC-06 (PNG o WebP en disco) se siguen sirviendo con su propio Content-Type', async () => {
      await mkdir(CARPETA_IMAGENES, { recursive: true });
      await writeFile(join(CARPETA_IMAGENES, `${ID_INEXISTENTE}.png`), png());
      await writeFile(join(CARPETA_IMAGENES, `${ID_INEXISTENTE}.webp`), webp());

      expect(
        (await http().get(`${RUTA_IMAGENES}/${ID_INEXISTENTE}.png`).expect(200))
          .headers['content-type'],
      ).toBe('image/png');
      expect(
        (await http().get(`${RUTA_IMAGENES}/${ID_INEXISTENTE}.webp`).expect(200))
          .headers['content-type'],
      ).toBe('image/webp');
    });

    it('D-46: `../`, nombres inválidos, otras extensiones o un UUID inexistente → 404; la carpeta no se lista', async () => {
      const id = await crearProducto();
      const imagen = await subirOk(id);
      const uuid = nombreEnDisco(imagen).replace('.jpg', '');
      // Archivo ajeno junto a las imágenes: tampoco debe poder leerse.
      await mkdir(CARPETA_IMAGENES, { recursive: true });

      const rutas = [
        `${RUTA_IMAGENES}/..%2F..%2F.env`,
        `${RUTA_IMAGENES}/..%2Fproductos%2F${uuid}.png`,
        `${RUTA_IMAGENES}/%2e%2e%2f%2e%2e%2fpackage.json`,
        `${RUTA_IMAGENES}/${uuid}.gif`,
        `${RUTA_IMAGENES}/${uuid}-x.jpg`,
        `${RUTA_IMAGENES}/${uuid}--m.jpg`,
        `${RUTA_IMAGENES}/${uuid}-m.png`,
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

  describe('DEC-06: dos tamaños, metadatos y dimensiones', () => {
    it('una foto de 1600×1200 queda en 800×600 (detalle) y 320×240 (miniatura); la base guarda las dimensiones', async () => {
      const id = await crearProducto();

      const imagen = await subirOk(id, await imagenReal('png', 1600, 1200));

      const detalle = await readFile(join(CARPETA_IMAGENES, nombreEnDisco(imagen)));
      const miniatura = await readFile(join(CARPETA_IMAGENES, miniaturaEnDisco(imagen)));
      expect(await dimensionesDe(detalle)).toEqual([800, 600]);
      expect(await dimensionesDe(miniatura)).toEqual([320, 240]);
      expect(miniatura.length).toBeLessThan(detalle.length);
      const [fila] = await contexto.fuente.query<
        { ancho: number; alto: number; tipo: string; tamanio_bytes: number }[]
      >('SELECT ancho, alto, tipo, tamanio_bytes FROM imagenes_producto');
      expect(fila).toEqual({ ancho: 800, alto: 600, tipo: 'jpg', tamanio_bytes: detalle.length });
    });

    it('quita el EXIF (GPS incluido) y respeta la orientación de la foto del celular', async () => {
      const id = await crearProducto();
      const foto = conExif(
        await imagenReal('jpeg', 300, 200),
        6,
        'GPS-FICTICIO -0.9536,-80.7286',
      );

      const imagen = await subirOk(id, foto);

      for (const nombre of archivosDe(imagen)) {
        const guardado = await readFile(join(CARPETA_IMAGENES, nombre));
        expect(guardado.includes('Exif')).toBe(false);
        expect(guardado.includes('GPS-FICTICIO')).toBe(false);
      }
      // Horizontal 300×200 con orientación 6 → vertical 200×300.
      const detalle = await readFile(join(CARPETA_IMAGENES, nombreEnDisco(imagen)));
      expect(await dimensionesDe(detalle)).toEqual([200, 300]);
    });

    it('más de 8000 px por lado o más de 40 MP → 422 DIMENSIONES_NO_ADMITIDAS; no queda fila ni archivo', async () => {
      const id = await crearProducto();
      const ancha = await imagenReal('png', 8001, 2);
      // Cabecera PNG de 7000×7000 (49 MP) sin decodificar: se rechaza antes.
      const enorme = Buffer.alloc(64, 0);
      Buffer.from(FIRMA_PNG).copy(enorme);
      enorme.writeUInt32BE(13, 8);
      enorme.write('IHDR', 12, 'latin1');
      enorme.writeUInt32BE(7000, 16);
      enorme.writeUInt32BE(7000, 20);

      for (const grande of [ancha, enorme]) {
        const respuesta = await subir(id, grande).expect(422);
        expect(respuesta.body.codigo).toBe('DIMENSIONES_NO_ADMITIDAS');
      }
      expect(await filasImagenes()).toBe(0);
      expect(await archivosEnDisco()).toEqual([]);
    });

    it('firma correcta pero imagen dañada → 415 TIPO_NO_ADMITIDO; no queda fila ni archivo', async () => {
      const id = await crearProducto();
      const rota = Buffer.concat([png().subarray(0, 40), Buffer.alloc(300, 0x41)]);

      for (const contenido of [rota, conRelleno(FIRMA_PNG)]) {
        const respuesta = await subir(id, contenido).expect(415);
        expect(respuesta.body.codigo).toBe('TIPO_NO_ADMITIDO');
      }
      expect(await filasImagenes()).toBe(0);
      expect(await archivosEnDisco()).toEqual([]);
    });
  });
});
