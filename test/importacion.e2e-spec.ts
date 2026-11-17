import request from 'supertest';
import {
  crearPdfCifradoSintetico,
  crearPdfDanadoSintetico,
  crearPdfLeonisaSintetico,
  crearPdfSinTextoSintetico,
  crearPdfYanbalSintetico,
} from '../src/modulos/importacion/infraestructura/pdf/pdf-sintetico.prueba-spec.js';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la subfase 2.8 (RF-PRO-01, RF-PRO-02, CA-02, RN-11, D-46, D-48, D-49,
 * D-55; contrato `productos-importacion`, «Endpoints» y «Pruebas mínimas»)
 * contra `catalogostock_pruebas` (D-23). Los PDF son sintéticos, generados en
 * la prueba: el PDF real no se versiona. Datos ficticios.
 */

const RUTA = '/api/v1/productos/importaciones';
const RUTA_PRODUCTOS = '/api/v1/productos';
const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const CORREO_CLIENTE = 'maria.zambrano@ejemplo.test';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000999';

interface CuerpoSesion {
  tokenAcceso: string;
}

interface CuerpoImportacion {
  id: string;
  nombreArchivo: string;
  marca: { id: string; nombre: string };
  paginas: number;
  totales: {
    pendientes: number;
    aprobados: number;
    descartados: number;
    conAdvertencias: number;
  };
  creadaEn: string;
}

interface CuerpoBorrador {
  id: string;
  idImportacion: string;
  pagina: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: string | null;
  precioNormal: string | null;
  marcaId: string;
  disponibilidad: string;
  estado: string;
  advertencias: string[];
  idProducto: string | null;
}

interface CuerpoLista {
  elementos: CuerpoBorrador[];
  pagina: number;
  tamanio: number;
  total: number;
}

interface CuerpoResultados {
  resultados: Array<{ id: string; estado?: string; idProducto?: string; error?: string }>;
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

describe('Subfase 2.8 (e2e): importación asistida del catálogo en PDF (RF-PRO-01, D-49, D-55)', () => {
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

  const crearMarca = async (nombre: string): Promise<string> =>
    (
      await comoVendedor(http().post('/api/v1/marcas'))
        .send({ nombre, color: '#2563EB' })
        .expect(201)
    ).body.id as string;

  const subir = (
    contenido: Buffer,
    opciones: { marca?: string; nombre?: string; tipo?: string } = {},
  ) =>
    comoVendedor(http().post(RUTA))
      .field('marcaId', opciones.marca ?? marcaId)
      .attach('archivo', contenido, {
        filename: opciones.nombre ?? 'catalogo.pdf',
        contentType: opciones.tipo ?? 'application/pdf',
      });

  const importarOk = async (
    contenido: Buffer = crearPdfYanbalSintetico(),
    nombre = 'catalogo.pdf',
  ): Promise<CuerpoImportacion> =>
    (await subir(contenido, { nombre }).expect(201)).body as CuerpoImportacion;

  const borradores = async (
    idImportacion: string,
    consulta = '',
  ): Promise<CuerpoLista> =>
    (
      await comoVendedor(
        http().get(`${RUTA}/${idImportacion}/borradores${consulta}`),
      ).expect(200)
    ).body as CuerpoLista;

  /** El borrador de un código (o el que no tiene código) de la lista de pendientes. */
  const borradorDe = async (
    idImportacion: string,
    codigo: string | null,
  ): Promise<CuerpoBorrador> => {
    const lista = await borradores(idImportacion, '?tamanio=100');
    const encontrado = lista.elementos.find((b) => b.codigo === codigo);
    if (encontrado === undefined) {
      throw new Error(`No hay borrador con código ${String(codigo)}`);
    }
    return encontrado;
  };

  const aprobar = (ids: string[]) =>
    comoVendedor(http().post(`${RUTA}/borradores/aprobar`)).send({ ids });
  const descartar = (ids: string[]) =>
    comoVendedor(http().post(`${RUTA}/borradores/descartar`)).send({ ids });

  async function contar(tabla: string): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM ${tabla}`,
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
    contexto = await crearAppPruebas();
  });

  beforeEach(async () => {
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
    marcaId = await crearMarca('Yanbal');
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('POST /productos/importaciones', () => {
    it('RF-PRO-01: un PDF sintético con 3 productos (oferta con precio normal, sin precio, sin código) → 201 y 3 borradores con las advertencias correctas', async () => {
      const importacion = await importarOk(
        crearPdfYanbalSintetico(),
        'C:\\Descargas\\Catálogo Yanbal.pdf',
      );

      expect(importacion).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        nombreArchivo: 'Catálogo Yanbal.pdf',
        marca: expect.objectContaining({ id: marcaId, nombre: 'Yanbal' }),
        paginas: 1,
        totales: { pendientes: 3, aprobados: 0, descartados: 0, conAdvertencias: 2 },
        creadaEn: expect.any(String),
      });
      const lista = await borradores(importacion.id);
      expect(lista).toMatchObject({ pagina: 1, tamanio: 20, total: 3 });
      expect(
        lista.elementos.map((b) => ({
          pagina: b.pagina,
          codigo: b.codigo,
          nombre: b.nombre,
          precio: b.precio,
          precioNormal: b.precioNormal,
          marcaId: b.marcaId,
          disponibilidad: b.disponibilidad,
          estado: b.estado,
          advertencias: b.advertencias,
          idProducto: b.idProducto,
        })),
      ).toEqual([
        {
          pagina: 1,
          codigo: '43873',
          nombre: 'Crema Hidratante Mani',
          precio: '35.00',
          precioNormal: '44.00',
          marcaId,
          disponibilidad: 'DISPONIBLE',
          estado: 'PENDIENTE',
          advertencias: ['PRECIO_EN_OFERTA'],
          idProducto: null,
        },
        {
          pagina: 1,
          codigo: '5054',
          nombre: 'Esmalte Color Rosa',
          precio: null,
          precioNormal: null,
          marcaId,
          disponibilidad: 'DISPONIBLE',
          estado: 'PENDIENTE',
          advertencias: ['SIN_PRECIO'],
          idProducto: null,
        },
        {
          pagina: 1,
          codigo: null,
          nombre: 'Jabón Líquido Avena',
          precio: '5.50',
          precioNormal: null,
          marcaId,
          disponibilidad: 'DISPONIBLE',
          estado: 'PENDIENTE',
          advertencias: ['SIN_CODIGO'],
          idProducto: null,
        },
      ]);
    });

    it('D-55: un PDF de Leonisa se lee con su perfil: precio, primera referencia como código, VARIAS_REFERENCIAS y referencias en la descripción', async () => {
      const importacion = await importarOk(crearPdfLeonisaSintetico());

      const lista = await borradores(importacion.id);
      expect(lista.total).toBe(2);
      expect(lista.elementos[0]).toMatchObject({
        codigo: '091183',
        nombre: 'Magic Corset',
        precio: '48.99',
        advertencias: ['VARIAS_REFERENCIAS'],
        descripcion:
          'Con arco. Varillas laterales. Multiusos: cruzado. ' +
          'Ref. 091183 / Copa B (tallas 32, 34; Blanco). ' +
          'Ref. 091183C / Copa C (tallas 36; Negro).',
      });
      expect(lista.elementos[1]).toMatchObject({
        codigo: '72323',
        nombre: 'Panty clásico',
        precio: '12.99',
        precioNormal: '15.99',
        advertencias: ['PRECIO_EN_OFERTA'],
      });
      // Las informativas no cuentan como «con advertencias».
      expect(importacion.totales).toMatchObject({ pendientes: 2, conAdvertencias: 0 });
    });

    it('D-46: archivo .pdf cuyo contenido es texto → 415 FORMATO_NO_PERMITIDO; no queda nada guardado', async () => {
      const respuesta = await subir(
        Buffer.from('esto no es un PDF, solo texto'),
        { nombre: 'falso.pdf' },
      ).expect(415);

      expect(respuesta.body.codigo).toBe('FORMATO_NO_PERMITIDO');
      expect(await contar('importaciones_producto')).toBe(0);
      expect(await contar('borradores_producto')).toBe(0);
    });

    it('D-46 / D-55: más de 60 MB → 413 ARCHIVO_DEMASIADO_GRANDE; un PDF de menos de 60 MB (el de Leonisa pesa 41.6 MB) no se rechaza por tamaño', async () => {
      const grande = Buffer.alloc(60 * 1024 * 1024 + 1024, 0x20);
      Buffer.from('%PDF-1.4').copy(grande);
      const respuesta = await subir(grande).expect(413);
      expect(respuesta.body.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');

      const mediano = Buffer.concat([
        crearPdfYanbalSintetico(),
        Buffer.alloc(42 * 1024 * 1024, 0x20),
      ]);
      // Relleno tras el %%EOF: pdfjs lo ignora (como los PDF con datos añadidos).
      await subir(mediano).expect(201);
      expect(await contar('importaciones_producto')).toBe(1);
    });

    it('D-46: PDF cifrado, dañado o sin texto → 422 PDF_ILEGIBLE; no queda nada guardado', async () => {
      for (const pdf of [
        crearPdfCifradoSintetico(),
        crearPdfDanadoSintetico(),
        crearPdfSinTextoSintetico(),
      ]) {
        const respuesta = await subir(pdf).expect(422);
        expect(respuesta.body.codigo).toBe('PDF_ILEGIBLE');
      }
      expect(await contar('importaciones_producto')).toBe(0);
    });

    it('un PDF con texto pero sin productos reconocibles → 422 PDF_ILEGIBLE', async () => {
      const { crearPdfSintetico } = await import(
        '../src/modulos/importacion/infraestructura/pdf/pdf-sintetico.prueba-spec.js'
      );
      const respuesta = await subir(
        crearPdfSintetico([[{ texto: 'Un texto cualquiera', x: 50, y: 50 }]]),
      ).expect(422);

      expect(respuesta.body.codigo).toBe('PDF_ILEGIBLE');
    });

    it('idempotencia: la misma huella dos veces → 409 IMPORTACION_DUPLICADA con el id de la existente, sin duplicar borradores', async () => {
      const primera = await importarOk();

      const respuesta = await subir(crearPdfYanbalSintetico(), {
        nombre: 'otro-nombre.pdf',
      }).expect(409);

      expect(respuesta.body.codigo).toBe('IMPORTACION_DUPLICADA');
      expect(respuesta.body.detalles).toEqual({ idImportacion: primera.id });
      expect(await contar('importaciones_producto')).toBe(1);
      expect(await contar('borradores_producto')).toBe(3);
    });

    it('idempotencia: dos subidas simultáneas del mismo PDF → una 201 y otra 409', async () => {
      const respuestas = await Promise.all([
        subir(crearPdfYanbalSintetico()),
        subir(crearPdfYanbalSintetico()),
      ]);

      expect(respuestas.map((r) => r.status).toSorted()).toEqual([201, 409]);
      expect(await contar('importaciones_producto')).toBe(1);
      expect(await contar('borradores_producto')).toBe(3);
    });

    it('D-48: marca inexistente → 404 MARCA_NO_ENCONTRADA; marca inactiva → 422 MARCA_INACTIVA; no queda nada guardado', async () => {
      const inactiva = await crearMarca('Cyzone');
      await comoVendedor(http().patch(`/api/v1/marcas/${inactiva}`))
        .send({ activa: false })
        .expect(200);

      const noExiste = await subir(crearPdfYanbalSintetico(), {
        marca: ID_INEXISTENTE,
      }).expect(404);
      const desactivada = await subir(crearPdfYanbalSintetico(), {
        marca: inactiva,
      }).expect(422);

      expect(noExiste.body.codigo).toBe('MARCA_NO_ENCONTRADA');
      expect(desactivada.body.codigo).toBe('MARCA_INACTIVA');
      expect(await contar('importaciones_producto')).toBe(0);
    });

    it('RNF-03: sin archivo, sin marcaId, marcaId inválido o con otro campo de texto → 400 DATOS_INVALIDOS', async () => {
      const sinArchivo = await comoVendedor(http().post(RUTA))
        .field('marcaId', marcaId)
        .expect(400);
      const sinMarca = await comoVendedor(http().post(RUTA))
        .attach('archivo', crearPdfYanbalSintetico(), {
          filename: 'catalogo.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
      const marcaMala = await subir(crearPdfYanbalSintetico(), {
        marca: 'no-es-uuid',
      }).expect(400);
      await comoVendedor(http().post(RUTA))
        .field('marcaId', marcaId)
        .field('nota', 'hola')
        .attach('archivo', crearPdfYanbalSintetico(), {
          filename: 'catalogo.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      for (const respuesta of [sinArchivo, sinMarca, marcaMala]) {
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      }
      expect(await contar('importaciones_producto')).toBe(0);
    });

    it('D-17: el sexto análisis en una hora desde la misma IP → 429 DEMASIADAS_SOLICITUDES con Retry-After', async () => {
      for (let i = 0; i < 5; i++) {
        await subir(Buffer.from('texto'), { nombre: `x${i}.pdf` }).expect(415);
      }

      const respuesta = await subir(Buffer.from('texto')).expect(429);

      expect(respuesta.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
      expect(Number(respuesta.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('D-20: la bitácora (IMPORTACION_CREADA) guarda solo ids y cantidades: ni el PDF, ni su contenido, ni el nombre del archivo', async () => {
      const importacion = await importarOk(
        crearPdfYanbalSintetico(),
        'Catálogo secreto de María.pdf',
      );

      const filas = await auditoria('IMPORTACION_CREADA');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        entidad: 'IMPORTACION',
        id_entidad: importacion.id,
        detalle: { idImportacion: importacion.id, borradores: 3, paginas: 1 },
      });
      const texto = JSON.stringify(filas[0]);
      expect(texto).not.toContain('secreto');
      expect(texto).not.toContain('María');
      expect(texto).not.toContain('Crema');
      expect(texto).not.toContain('.pdf');
    });

    it('D-49: el PDF no se guarda: solo queda su huella SHA-256 (64 hexadecimales)', async () => {
      await importarOk();

      const [{ huella }] = await contexto.fuente.query<{ huella: string }[]>(
        'SELECT huella FROM importaciones_producto',
      );
      expect(huella).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('GET /productos/importaciones/{id} y /borradores', () => {
    it('devuelve la importación con sus totales; 404 si no existe; id no UUID → 400', async () => {
      const importacion = await importarOk();

      const respuesta = await comoVendedor(
        http().get(`${RUTA}/${importacion.id}`),
      ).expect(200);
      expect(respuesta.body).toEqual(importacion);
      await comoVendedor(http().get(`${RUTA}/${ID_INEXISTENTE}`)).expect(404);
      await comoVendedor(http().get(`${RUTA}/no-es-uuid`)).expect(400);
      await comoVendedor(
        http().get(`${RUTA}/${ID_INEXISTENTE}/borradores`),
      ).expect(404);
    });

    it('paginación y filtros: estado (PENDIENTE por defecto), conAdvertencias, busqueda sin tildes ni mayúsculas, paginaPdf', async () => {
      const importacion = await importarOk();
      const jabon = await borradorDe(importacion.id, null);
      await descartar([jabon.id]).expect(200);

      expect((await borradores(importacion.id)).total).toBe(2);
      expect((await borradores(importacion.id, '?estado=DESCARTADO')).total).toBe(1);
      expect((await borradores(importacion.id, '?estado=APROBADO')).total).toBe(0);
      expect(
        (await borradores(importacion.id, '?conAdvertencias=true')).total,
      ).toBe(1);
      expect(
        (await borradores(importacion.id, '?conAdvertencias=false')).total,
      ).toBe(1);
      expect(
        (await borradores(importacion.id, '?busqueda=CREMA%20hidratante')).elementos,
      ).toHaveLength(1);
      expect((await borradores(importacion.id, '?busqueda=5054')).total).toBe(1);
      expect((await borradores(importacion.id, '?paginaPdf=1')).total).toBe(2);
      expect((await borradores(importacion.id, '?paginaPdf=2')).total).toBe(0);
      const segunda = await borradores(importacion.id, '?pagina=2&tamanio=1');
      expect(segunda).toMatchObject({ pagina: 2, tamanio: 1, total: 2 });
      expect(segunda.elementos).toHaveLength(1);
    });

    it('RNF-03: parámetros inválidos → 400', async () => {
      const importacion = await importarOk();

      for (const consulta of [
        '?estado=OTRO',
        '?conAdvertencias=quizas',
        '?paginaPdf=0',
        '?paginaPdf=abc',
        '?tamanio=101',
        '?busqueda=',
      ]) {
        const respuesta = await comoVendedor(
          http().get(`${RUTA}/${importacion.id}/borradores${consulta}`),
        );
        expect([consulta, respuesta.status]).toEqual([consulta, 400]);
      }
    });
  });

  describe('principio 1: un borrador nunca es un producto', () => {
    it('un borrador pendiente no aparece en GET /productos (ni para el Vendedor ni para el Cliente) y no existe como producto', async () => {
      const importacion = await importarOk();
      const borrador = await borradorDe(importacion.id, '43873');

      for (const sesion of [comoVendedor, comoCliente]) {
        const lista = await sesion(http().get(RUTA_PRODUCTOS)).expect(200);
        expect(lista.body.total).toBe(0);
        expect(
          JSON.stringify(lista.body).includes('Crema Hidratante Mani'),
        ).toBe(false);
      }
      await comoVendedor(
        http().get(`${RUTA_PRODUCTOS}/${borrador.id}`),
      ).expect(404);
      expect(await contar('productos')).toBe(0);
    });
  });

  describe('PATCH /productos/importaciones/borradores/{id}', () => {
    it('RN-11: precio «12.505» → 400; precio como número → 400; campo no declarado → 400; nada cambia', async () => {
      const importacion = await importarOk();
      const borrador = await borradorDe(importacion.id, '43873');
      const editar = (cuerpo: object) =>
        comoVendedor(http().patch(`${RUTA}/borradores/${borrador.id}`)).send(cuerpo);

      for (const cuerpo of [
        { precio: '12.505' },
        { precio: 12.5 },
        { precio: '0' },
        { nombre: 'x' },
        { disponibilidad: 'EN_CAMINO' },
        { codigo: '999' },
        { estado: 'APROBADO' },
        { marcaId: 'no-es-uuid' },
      ]) {
        const respuesta = await editar(cuerpo);
        expect([cuerpo, respuesta.status, respuesta.body.codigo]).toEqual([
          cuerpo,
          400,
          'DATOS_INVALIDOS',
        ]);
      }
      expect((await borradorDe(importacion.id, '43873')).precio).toBe('35.00');
    });

    it('edita nombre, descripción, precio, marca y disponibilidad, y recalcula las advertencias', async () => {
      const importacion = await importarOk();
      const sinPrecio = await borradorDe(importacion.id, '5054');
      const otraMarca = await crearMarca('Avon');
      expect(sinPrecio.advertencias).toEqual(['SIN_PRECIO']);

      const respuesta = await comoVendedor(
        http().patch(`${RUTA}/borradores/${sinPrecio.id}`),
      )
        .send({
          nombre: 'Esmalte Rosa Pastel',
          descripcion: 'Cont. 8 ml',
          precio: '4.5',
          marcaId: otraMarca,
          disponibilidad: 'AGOTADO',
        })
        .expect(200);

      expect(respuesta.body).toMatchObject({
        id: sinPrecio.id,
        nombre: 'Esmalte Rosa Pastel',
        descripcion: 'Cont. 8 ml',
        precio: '4.50',
        marcaId: otraMarca,
        disponibilidad: 'AGOTADO',
        estado: 'PENDIENTE',
        advertencias: [],
      });
      const totales = (
        await comoVendedor(http().get(`${RUTA}/${importacion.id}`)).expect(200)
      ).body.totales;
      expect(totales.conAdvertencias).toBe(1);
    });

    it('D-48: marca inactiva → 422 MARCA_INACTIVA; inexistente → 404 MARCA_NO_ENCONTRADA; borrador inexistente → 404', async () => {
      const importacion = await importarOk();
      const borrador = await borradorDe(importacion.id, '43873');
      const inactiva = await crearMarca('Cyzone');
      await comoVendedor(http().patch(`/api/v1/marcas/${inactiva}`))
        .send({ activa: false })
        .expect(200);
      const editar = (cuerpo: object) =>
        comoVendedor(http().patch(`${RUTA}/borradores/${borrador.id}`)).send(cuerpo);

      expect((await editar({ marcaId: inactiva }).expect(422)).body.codigo).toBe(
        'MARCA_INACTIVA',
      );
      expect(
        (await editar({ marcaId: ID_INEXISTENTE }).expect(404)).body.codigo,
      ).toBe('MARCA_NO_ENCONTRADA');
      await comoVendedor(http().patch(`${RUTA}/borradores/${ID_INEXISTENTE}`))
        .send({ precio: '1' })
        .expect(404);
      expect((await borradorDe(importacion.id, '43873')).marcaId).toBe(marcaId);
    });

    it('un borrador aprobado o descartado → 422 BORRADOR_NO_EDITABLE', async () => {
      const importacion = await importarOk();
      const aprobado = await borradorDe(importacion.id, '43873');
      const descartado = await borradorDe(importacion.id, '5054');
      await aprobar([aprobado.id]).expect(200);
      await descartar([descartado.id]).expect(200);

      for (const borrador of [aprobado, descartado]) {
        const respuesta = await comoVendedor(
          http().patch(`${RUTA}/borradores/${borrador.id}`),
        )
          .send({ precio: '9.99' })
          .expect(422);
        expect(respuesta.body.codigo).toBe('BORRADOR_NO_EDITABLE');
      }
    });
  });

  describe('POST /productos/importaciones/borradores/aprobar', () => {
    it('RF-PRO-01: crea el producto con las mismas validaciones y la descripción termina con «Cód. <código>»; PRODUCTO_CREADO y BORRADORES_APROBADOS en la bitácora', async () => {
      const importacion = await importarOk();
      const borrador = await borradorDe(importacion.id, '43873');
      await comoVendedor(http().patch(`${RUTA}/borradores/${borrador.id}`))
        .send({ descripcion: 'Cont. 50 ml' })
        .expect(200);

      const respuesta = await aprobar([borrador.id]).expect(200);

      const [resultado] = (respuesta.body as CuerpoResultados).resultados;
      expect(resultado).toEqual({
        id: borrador.id,
        estado: 'APROBADO',
        idProducto: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
      const producto = (
        await comoCliente(
          http().get(`${RUTA_PRODUCTOS}/${resultado.idProducto}`),
        ).expect(200)
      ).body;
      expect(producto).toMatchObject({
        nombre: 'Crema Hidratante Mani',
        precio: '35.00',
        descripcion: 'Cont. 50 ml Cód. 43873',
        disponibilidad: 'DISPONIBLE',
        marca: { id: marcaId },
      });
      const aprobado = await borradores(importacion.id, '?estado=APROBADO');
      expect(aprobado.elementos[0]).toMatchObject({
        id: borrador.id,
        estado: 'APROBADO',
        idProducto: resultado.idProducto,
      });
      const creados = await auditoria('PRODUCTO_CREADO');
      expect(creados).toHaveLength(1);
      expect(creados[0].id_entidad).toBe(resultado.idProducto);
      const aprobados = await auditoria('BORRADORES_APROBADOS');
      expect(aprobados).toHaveLength(1);
      expect(aprobados[0]).toMatchObject({
        entidad: 'IMPORTACION',
        id_entidad: importacion.id,
        detalle: { idImportacion: importacion.id, cantidad: 1 },
      });
    });

    it('un borrador de Leonisa aprobado lleva las referencias en la descripción y «Cód. <primera referencia>» al final', async () => {
      const importacion = await importarOk(crearPdfLeonisaSintetico());
      const borrador = await borradorDe(importacion.id, '091183');

      const respuesta = await aprobar([borrador.id]).expect(200);

      const idProducto = (respuesta.body as CuerpoResultados).resultados[0]
        .idProducto;
      const producto = (
        await comoVendedor(http().get(`${RUTA_PRODUCTOS}/${idProducto}`)).expect(200)
      ).body;
      expect(producto.descripcion).toMatch(
        /^Con arco\. Varillas laterales\..*Ref\. 091183 \/ Copa B.*Ref\. 091183C \/ Copa C.* Cód\. 091183$/,
      );
    });

    it('idempotente: aprobar dos veces no duplica el producto (la segunda responde NO_PENDIENTE)', async () => {
      const importacion = await importarOk();
      const { id } = await borradorDe(importacion.id, '43873');

      await aprobar([id]).expect(200);
      const segunda = await aprobar([id]).expect(200);

      expect((segunda.body as CuerpoResultados).resultados).toEqual([
        { id, error: 'NO_PENDIENTE' },
      ]);
      expect(await contar('productos')).toBe(1);
      expect(await auditoria('PRODUCTO_CREADO')).toHaveLength(1);
    });

    it('aprobar el mismo borrador en paralelo crea un solo producto', async () => {
      const importacion = await importarOk();
      const { id } = await borradorDe(importacion.id, '43873');

      const [uno, dos] = await Promise.all([aprobar([id]), aprobar([id])]);

      const resultados = [
        ...(uno.body as CuerpoResultados).resultados,
        ...(dos.body as CuerpoResultados).resultados,
      ];
      expect(resultados.filter((r) => r.estado === 'APROBADO')).toHaveLength(1);
      expect(resultados.filter((r) => r.error === 'NO_PENDIENTE')).toHaveLength(1);
      expect(await contar('productos')).toBe(1);
    });

    it('RN-11: sin precio no se aprueba (SIN_PRECIO) hasta que el Vendedor lo escribe; borrador inexistente → NO_ENCONTRADO', async () => {
      const importacion = await importarOk();
      const sinPrecio = await borradorDe(importacion.id, '5054');

      const primera = await aprobar([sinPrecio.id, ID_INEXISTENTE]).expect(200);
      expect((primera.body as CuerpoResultados).resultados).toEqual([
        { id: sinPrecio.id, error: 'SIN_PRECIO' },
        { id: ID_INEXISTENTE, error: 'NO_ENCONTRADO' },
      ]);
      expect(await contar('productos')).toBe(0);
      expect(await auditoria('BORRADORES_APROBADOS')).toHaveLength(0);

      await comoVendedor(http().patch(`${RUTA}/borradores/${sinPrecio.id}`))
        .send({ precio: '3.25' })
        .expect(200);
      const segunda = await aprobar([sinPrecio.id]).expect(200);
      expect((segunda.body as CuerpoResultados).resultados[0].estado).toBe('APROBADO');
      expect(await contar('productos')).toBe(1);
    });

    it('transacción por borrador: un fallo (marca desactivada después) no deshace los demás aprobados', async () => {
      const importacion = await importarOk();
      const buenoUno = await borradorDe(importacion.id, '43873');
      const buenoDos = await borradorDe(importacion.id, null);
      const malo = await borradorDe(importacion.id, '5054');
      const marcaMala = await crearMarca('Cyzone');
      await comoVendedor(http().patch(`${RUTA}/borradores/${malo.id}`))
        .send({ precio: '2.00', marcaId: marcaMala })
        .expect(200);
      await comoVendedor(http().patch(`/api/v1/marcas/${marcaMala}`))
        .send({ activa: false })
        .expect(200);

      const respuesta = await aprobar([buenoUno.id, malo.id, buenoDos.id]).expect(200);

      expect((respuesta.body as CuerpoResultados).resultados).toEqual([
        { id: buenoUno.id, estado: 'APROBADO', idProducto: expect.any(String) },
        { id: malo.id, error: 'MARCA_INACTIVA' },
        { id: buenoDos.id, estado: 'APROBADO', idProducto: expect.any(String) },
      ]);
      expect(await contar('productos')).toBe(2);
      expect(await auditoria('PRODUCTO_CREADO')).toHaveLength(2);
      // El que falló sigue pendiente y no dejó producto a medias.
      const pendientes = await borradores(importacion.id);
      expect(pendientes.elementos.map((b) => b.id)).toEqual([malo.id]);
      expect((await auditoria('BORRADORES_APROBADOS'))[0].detalle).toMatchObject({
        cantidad: 2,
      });
    });

    it('RNF-03: ids vacío, de más de 100, repetido en tipo o que no son UUID → 400; nada cambia', async () => {
      const importacion = await importarOk();
      const { id } = await borradorDe(importacion.id, '43873');
      const cientoUno = Array.from({ length: 101 }, () => id);

      for (const ids of [[], cientoUno, ['no-es-uuid'], 'texto', undefined]) {
        for (const ruta of ['aprobar', 'descartar']) {
          const respuesta = await comoVendedor(
            http().post(`${RUTA}/borradores/${ruta}`),
          ).send({ ids });
          expect([ruta, ids, respuesta.status]).toEqual([ruta, ids, 400]);
        }
      }
      await comoVendedor(http().post(`${RUTA}/borradores/aprobar`))
        .send({ ids: [id], extra: 1 })
        .expect(400);
      expect(await contar('productos')).toBe(0);
    });
  });

  describe('POST /productos/importaciones/borradores/descartar', () => {
    it('marca DESCARTADO, registra BORRADORES_DESCARTADOS y después ya no se puede aprobar; no se reactiva', async () => {
      const importacion = await importarOk();
      const { id } = await borradorDe(importacion.id, '43873');

      const respuesta = await descartar([id]).expect(200);
      expect((respuesta.body as CuerpoResultados).resultados).toEqual([
        { id, estado: 'DESCARTADO' },
      ]);
      const intento = await aprobar([id]).expect(200);
      expect((intento.body as CuerpoResultados).resultados).toEqual([
        { id, error: 'NO_PENDIENTE' },
      ]);
      const otra = await descartar([id]).expect(200);
      expect((otra.body as CuerpoResultados).resultados).toEqual([
        { id, error: 'NO_PENDIENTE' },
      ]);

      expect(await contar('productos')).toBe(0);
      const filas = await auditoria('BORRADORES_DESCARTADOS');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        entidad: 'IMPORTACION',
        id_entidad: importacion.id,
        detalle: { idImportacion: importacion.id, cantidad: 1 },
      });
      const totales = (
        await comoVendedor(http().get(`${RUTA}/${importacion.id}`)).expect(200)
      ).body.totales;
      expect(totales).toEqual({
        pendientes: 2,
        aprobados: 0,
        descartados: 1,
        conAdvertencias: 2,
      });
    });
  });

  describe('CA-02: solo el Vendedor', () => {
    it('el Cliente en cualquier ruta → 403 NO_AUTORIZADO, queda ACCESO_DENEGADO y nada cambia', async () => {
      const importacion = await importarOk();
      const { id } = await borradorDe(importacion.id, '43873');
      const antes = await auditoria('ACCESO_DENEGADO');

      const respuestas = [
        await comoCliente(http().post(RUTA))
          .field('marcaId', marcaId)
          .attach('archivo', crearPdfLeonisaSintetico(), {
            filename: 'c.pdf',
            contentType: 'application/pdf',
          }),
        await comoCliente(http().get(`${RUTA}/${importacion.id}`)),
        await comoCliente(http().get(`${RUTA}/${importacion.id}/borradores`)),
        await comoCliente(http().patch(`${RUTA}/borradores/${id}`)).send({
          precio: '1',
        }),
        await comoCliente(http().post(`${RUTA}/borradores/aprobar`)).send({ ids: [id] }),
        await comoCliente(http().post(`${RUTA}/borradores/descartar`)).send({ ids: [id] }),
      ];

      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(403);
        expect(respuesta.body.codigo).toBe('NO_AUTORIZADO');
      }
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(antes.length + 6);
      expect(await contar('productos')).toBe(0);
      expect(await contar('importaciones_producto')).toBe(1);
      expect((await borradorDe(importacion.id, '43873')).precio).toBe('35.00');
    });

    it('sin sesión → 401 en todas las rutas', async () => {
      const importacion = await importarOk();

      await http().post(RUTA).expect(401);
      await http().get(`${RUTA}/${importacion.id}`).expect(401);
      await http().get(`${RUTA}/${importacion.id}/borradores`).expect(401);
      await http().patch(`${RUTA}/borradores/${ID_INEXISTENTE}`).send({}).expect(401);
      await http().post(`${RUTA}/borradores/aprobar`).send({ ids: [] }).expect(401);
      await http().post(`${RUTA}/borradores/descartar`).send({ ids: [] }).expect(401);
    });
  });

  describe('YA_IMPORTADO', () => {
    it('un código aprobado en otra importación marca el borrador nuevo con YA_IMPORTADO', async () => {
      const primera = await importarOk();
      const { id } = await borradorDe(primera.id, '43873');
      await aprobar([id]).expect(200);

      // Otro PDF (otra huella) con el mismo código.
      const { crearPdfSintetico } = await import(
        '../src/modulos/importacion/infraestructura/pdf/pdf-sintetico.prueba-spec.js'
      );
      const segunda = await importarOk(
        crearPdfSintetico([
          [
            { texto: 'Crema Mani Reedición', x: 50, y: 100 },
            { texto: 'OFERTA US$ 30.00', x: 50, y: 112 },
            { texto: 'CÓD. 43873', x: 50, y: 124 },
            { texto: 'Pág. 3', x: 50, y: 134 },
          ],
        ]),
      );

      const repetido = await borradorDe(segunda.id, '43873');
      expect(repetido.advertencias).toEqual(['YA_IMPORTADO']);
      expect(segunda.totales.conAdvertencias).toBe(1);
    });
  });
});
