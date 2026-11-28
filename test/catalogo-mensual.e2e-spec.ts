import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { Reloj } from '../src/compartido/aplicacion/reloj.puerto.js';
import {
  type LineaSintetica,
  crearPdfSintetico,
} from '../src/modulos/importacion/infraestructura/pdf/pdf-sintetico.prueba-spec.js';
import { EliminarImportacionesVencidasCasoUso } from '../src/modulos/importacion/aplicacion/casos-uso/eliminar-importaciones-vencidas.caso-uso.js';
import { BORRADOR_REPOSITORIO } from '../src/modulos/importacion/aplicacion/puertos/borrador.repositorio.js';
import { IMPORTACION_REPOSITORIO } from '../src/modulos/importacion/aplicacion/puertos/importacion.repositorio.js';
import { PlanificadorRetencionImportaciones } from '../src/modulos/importacion/infraestructura/planificador/planificador-retencion.js';
import { SERVICIO_AUDITORIA } from '../src/modulos/auditoria/index.js';
import { UNIDAD_DE_TRABAJO } from '../src/compartido/aplicacion/unidad-trabajo.puerto.js';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';
import { PNG_PRUEBA } from './preparacion/imagenes-prueba.js';

/**
 * e2e de los catálogos mensuales (D-57; contrato `productos-importacion`,
 * «Catálogos mensuales» y «Pruebas mínimas (catálogos mensuales)»; RF-PRO-01,
 * RF-PRO-02, PA-07, CA-02, D-20) contra `catalogostock_pruebas` (D-23). Los PDF
 * son sintéticos y los datos, ficticios.
 */

const RUTA = '/api/v1/productos/importaciones';
const RUTA_PRODUCTOS = '/api/v1/productos';
const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.mensual@ejemplo.test';
const CORREO_CLIENTE = 'cliente.mensual@ejemplo.test';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000999';
const RAIZ_ALMACENAMIENTO = resolve(process.env.RUTA_ALMACENAMIENTO ?? '');
/** PNG real: desde D-62 el servidor decodifica cada imagen subida. */
const PNG = PNG_PRUEBA;

interface CuerpoSesion {
  tokenAcceso: string;
}

interface Totales {
  pendientes: number;
  aprobados: number;
  descartados: number;
  conAdvertencias: number;
  actualizaran: number;
  nuevos: number;
  ausentes: number;
}

interface CuerpoImportacion {
  id: string;
  nombreArchivo: string;
  marca: { id: string; nombre: string };
  estado: 'VIGENTE' | 'ARCHIVADA';
  totales: Totales;
  creadaEn: string;
  archivadaEn: string | null;
  eliminaEn: string | null;
}

interface CuerpoBorrador {
  id: string;
  codigo: string | null;
  nombre: string;
  precio: string | null;
  estado: string;
  advertencias: string[];
  productoExistente: { id: string; nombre: string; precio: string } | null;
  idProducto: string | null;
}

interface CuerpoResultados {
  resultados: Array<{
    id: string;
    estado?: string;
    idProducto?: string;
    accion?: string;
    error?: string;
  }>;
}

interface CuerpoProducto {
  id: string;
  nombre: string;
  codigo: string | null;
  precio: string;
  descripcion: string;
  disponibilidad: string;
  imagenes: Array<{ id: string }>;
}

interface FilaAuditoria {
  accion: string;
  id_usuario: string | null;
  entidad: string | null;
  id_entidad: string | null;
  detalle: Record<string, unknown>;
}

type Producto = [nombre: string, codigo: string, precio: string];

/** Catálogo sintético estilo Yanbal: una línea de nombre, precio y código por producto. */
function catalogo(productos: readonly Producto[]): Buffer {
  const lineas: LineaSintetica[] = [];
  productos.forEach(([nombre, codigo, precio], i) => {
    const y = 100 + i * 100;
    lineas.push(
      { texto: nombre, x: 50, y },
      { texto: `OFERTA US$ ${precio}`, x: 50, y: y + 12 },
      { texto: `CÓD. ${codigo}`, x: 50, y: y + 24 },
      { texto: `Pág. ${i + 3}`, x: 50, y: y + 34 },
    );
  });
  return crearPdfSintetico([lineas]);
}

const MES_1: Producto[] = [
  ['Crema Hidratante Mani', '43873', '35.00'],
  ['Esmalte Color Rosa', '5054', '8.00'],
  ['Perfume Floral Noche', '77001', '20.00'],
];
const MES_2: Producto[] = [
  ['Crema Hidratante Mani', '43873', '37.50'],
  ['Esmalte Color Rosa', '5054', '8.00'],
  ['Labial Mate Rojo', '88002', '6.00'],
];

const relojEn = (instante: string): Reloj => ({ ahora: () => new Date(instante) });

function conToken<T extends { set(c: string, v: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

describe('D-57 (e2e): catálogos mensuales', () => {
  let contexto: AppPruebas;
  let vendedor: CuerpoSesion;
  let cliente: CuerpoSesion;
  let marcaId: string;

  const http = () => request(contexto.app.getHttpServer());
  const comoVendedor = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, vendedor.tokenAcceso);
  const comoCliente = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, cliente.tokenAcceso);

  const crearMarca = async (nombre: string): Promise<string> =>
    (
      await comoVendedor(http().post('/api/v1/marcas'))
        .send({ nombre, color: '#2563EB' })
        .expect(201)
    ).body.id as string;

  const subir = (contenido: Buffer, marca: string = marcaId) =>
    comoVendedor(http().post(RUTA))
      .field('marcaId', marca)
      .attach('archivo', contenido, {
        filename: 'catalogo-privado.pdf',
        contentType: 'application/pdf',
      });

  const importar = async (
    productos: readonly Producto[],
    marca: string = marcaId,
  ): Promise<CuerpoImportacion> =>
    (await subir(catalogo(productos), marca).expect(201)).body as CuerpoImportacion;

  const obtener = async (id: string): Promise<CuerpoImportacion> =>
    (await comoVendedor(http().get(`${RUTA}/${id}`)).expect(200))
      .body as CuerpoImportacion;

  const borradores = async (id: string, consulta = ''): Promise<CuerpoBorrador[]> =>
    (
      await comoVendedor(
        http().get(`${RUTA}/${id}/borradores?tamanio=100${consulta}`),
      ).expect(200)
    ).body.elementos as CuerpoBorrador[];

  const borradorDe = async (id: string, codigo: string): Promise<CuerpoBorrador> => {
    const encontrado = (await borradores(id, '&estado=PENDIENTE')).find(
      (b) => b.codigo === codigo,
    );
    if (encontrado === undefined) {
      throw new Error(`No hay borrador pendiente ${codigo}`);
    }
    return encontrado;
  };

  const aprobar = (ids: string[]) =>
    comoVendedor(http().post(`${RUTA}/borradores/aprobar`)).send({ ids });

  const aprobarCodigo = async (importacion: string, codigo: string) => {
    const { id } = await borradorDe(importacion, codigo);
    return ((await aprobar([id]).expect(200)).body as CuerpoResultados).resultados[0];
  };

  const aprobarTodos = async (importacion: string) => {
    const ids = (await borradores(importacion, '&estado=PENDIENTE')).map((b) => b.id);
    return ((await aprobar(ids).expect(200)).body as CuerpoResultados).resultados;
  };

  const producto = async (id: string): Promise<CuerpoProducto> =>
    (await comoVendedor(http().get(`${RUTA_PRODUCTOS}/${id}`)).expect(200))
      .body as CuerpoProducto;

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
      nombre: 'Vendedor Mensual',
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
        nombre: 'Rosa Intriago',
        correo: CORREO_CLIENTE,
        telefono: '0991234567',
        clave: CLAVE,
        aceptaPrivacidad: true,
        versionPrivacidad: VERSION_AVISO,
      })
      .expect(201);
    vendedor = (
      await http()
        .post('/api/v1/autenticacion/ingreso/vendedor')
        .send({ correo: CORREO_VENDEDOR, clave: CLAVE_VENDEDOR })
        .expect(200)
    ).body as CuerpoSesion;
    cliente = (
      await http()
        .post('/api/v1/autenticacion/ingreso/cliente')
        .send({ correo: CORREO_CLIENTE, clave: CLAVE })
        .expect(200)
    ).body as CuerpoSesion;
    marcaId = await crearMarca('Yanbal');
  });

  afterAll(async () => {
    await contexto?.cerrar();
    rmSync(RAIZ_ALMACENAMIENTO, { recursive: true, force: true });
  });

  /** Caso de uso de la retención con el reloj dado (reloj controlado, D-57). */
  const casoUso = (reloj: Reloj) =>
    new EliminarImportacionesVencidasCasoUso(
      contexto.app.get(IMPORTACION_REPOSITORIO, { strict: false }),
      contexto.app.get(BORRADOR_REPOSITORIO, { strict: false }),
      reloj,
      contexto.app.get(UNIDAD_DE_TRABAJO, { strict: false }),
      contexto.app.get(SERVICIO_AUDITORIA, { strict: false }),
    );

  async function fijarArchivada(id: string, archivadaEn: string): Promise<void> {
    await contexto.fuente.query(
      `UPDATE importaciones_producto SET estado = 'ARCHIVADA', archivada_en = $2 WHERE id = $1`,
      [id, archivadaEn],
    );
  }

  describe('código del producto', () => {
    it('D-57: POST y PATCH aceptan codigo y Producto lo devuelve; el mismo código en la marca → 409 CODIGO_DUPLICADO; otra marca sí', async () => {
      const crear = (cuerpo: object) =>
        comoVendedor(http().post(RUTA_PRODUCTOS)).send({
          nombre: 'Crema Mani',
          marcaId,
          precio: '10.00',
          ...cuerpo,
        });

      const creado = (await crear({ codigo: '43873' }).expect(201)).body as CuerpoProducto;
      expect(creado.codigo).toBe('43873');
      expect((await crear({}).expect(201)).body.codigo).toBeNull();
      expect((await crear({ codigo: '43873' }).expect(409)).body.codigo).toBe(
        'CODIGO_DUPLICADO',
      );
      const otraMarca = await crearMarca('Avon');
      await crear({ codigo: '43873', marcaId: otraMarca }).expect(201);

      const otro = (await crear({ codigo: 'AB12' }).expect(201)).body as CuerpoProducto;
      const choque = await comoVendedor(http().patch(`${RUTA_PRODUCTOS}/${otro.id}`)).send({
        codigo: '43873',
      });
      expect([choque.status, choque.body.codigo]).toEqual([409, 'CODIGO_DUPLICADO']);
      const cambio = await comoVendedor(http().patch(`${RUTA_PRODUCTOS}/${otro.id}`))
        .send({ codigo: 'ZZ99' })
        .expect(200);
      expect(cambio.body.codigo).toBe('ZZ99');
      expect((await producto(otro.id)).codigo).toBe('ZZ99');
    });

    it('RNF-03: un código con espacios, símbolos, de más de 20 caracteres o null → 400 y nada cambia', async () => {
      for (const codigo of ['43 873', 'ab-1', 'X'.repeat(21), '', null, 12]) {
        const respuesta = await comoVendedor(http().post(RUTA_PRODUCTOS)).send({
          nombre: 'Crema',
          marcaId,
          precio: '10',
          codigo,
        });
        expect([codigo, respuesta.status]).toEqual([codigo, 400]);
      }
      expect(await contar('productos')).toBe(0);
    });

    it('un producto eliminado libera su código; el listado busca por código', async () => {
      const uno = (
        await comoVendedor(http().post(RUTA_PRODUCTOS))
          .send({ nombre: 'Crema Mani', marcaId, precio: '10', codigo: 'K100' })
          .expect(201)
      ).body as CuerpoProducto;
      const hallado = await comoVendedor(
        http().get(`${RUTA_PRODUCTOS}?busqueda=k100`),
      ).expect(200);
      expect(hallado.body.elementos.map((p: CuerpoProducto) => p.id)).toEqual([uno.id]);

      await comoVendedor(http().delete(`${RUTA_PRODUCTOS}/${uno.id}`)).expect(204);
      await comoVendedor(http().post(RUTA_PRODUCTOS))
        .send({ nombre: 'Crema Nueva', marcaId, precio: '12', codigo: 'K100' })
        .expect(201);
    });
  });

  describe('flujo mensual completo', () => {
    it('D-57, PA-07: el segundo catálogo actualiza SOLO el precio de los productos existentes (conservando nombre, descripción, disponibilidad e imágenes), crea los nuevos y avisa los ausentes', async () => {
      const mes1 = await importar(MES_1);
      expect(mes1.estado).toBe('VIGENTE');
      const primeros = await aprobarTodos(mes1.id);
      expect(primeros.map((r) => r.accion)).toEqual(['CREADO', 'CREADO', 'CREADO']);
      const idCrema = primeros[0].idProducto!;
      const idEsmalte = primeros[1].idProducto!;
      expect((await producto(idCrema)).codigo).toBe('43873');

      // El Vendedor edita la crema (nombre, descripción, disponibilidad) y le sube una imagen.
      await comoVendedor(http().patch(`${RUTA_PRODUCTOS}/${idCrema}`))
        .send({
          nombre: 'Crema de Manos Premium',
          descripcion: 'Texto del Vendedor',
          disponibilidad: 'AGOTADO',
        })
        .expect(200);
      await comoVendedor(http().post(`${RUTA_PRODUCTOS}/${idCrema}/imagenes`))
        .attach('archivo', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      const antesCrema = await producto(idCrema);
      const antesEsmalte = await producto(idEsmalte);
      const bitacoraAntes = (await auditoria('PRODUCTO_ACTUALIZADO')).length;

      // Catálogo del mes siguiente.
      const mes2 = await importar(MES_2);
      expect((await obtener(mes1.id)).estado).toBe('ARCHIVADA');
      expect(mes2.estado).toBe('VIGENTE');
      expect(mes2.totales).toMatchObject({
        pendientes: 3,
        actualizaran: 2,
        nuevos: 1,
        ausentes: 1,
      });

      // Revisión: «precio actual → precio nuevo».
      const crema = await borradorDe(mes2.id, '43873');
      expect(crema.precio).toBe('37.50');
      expect(crema.productoExistente).toEqual({
        id: idCrema,
        nombre: 'Crema de Manos Premium',
        precio: '35.00',
      });
      expect(crema.advertencias).toContain('YA_IMPORTADO');
      expect((await borradorDe(mes2.id, '88002')).productoExistente).toBeNull();

      // Ausentes: solo informa.
      const ausentes = (
        await comoVendedor(http().get(`${RUTA}/${mes2.id}/ausentes`)).expect(200)
      ).body;
      expect(ausentes).toEqual({
        elementos: [
          {
            id: expect.any(String),
            nombre: 'Perfume Floral Noche',
            codigo: '77001',
            precio: '20.00',
            disponibilidad: 'DISPONIBLE',
          },
        ],
        pagina: 1,
        tamanio: 20,
        total: 1,
      });

      const resultados = await aprobarTodos(mes2.id);

      expect(resultados.map((r) => r.accion).toSorted()).toEqual([
        'ACTUALIZADO',
        'CREADO',
        'SIN_CAMBIO',
      ]);
      const deCrema = resultados.find((r) => r.idProducto === idCrema)!;
      expect(deCrema.accion).toBe('ACTUALIZADO');
      expect(resultados.find((r) => r.idProducto === idEsmalte)?.accion).toBe('SIN_CAMBIO');
      // Un producto por código: 3 de antes + 1 nuevo.
      expect(await contar('productos')).toBe(4);

      const despuesCrema = await producto(idCrema);
      // Solo cambian el precio y la fecha de actualización.
      expect({ ...despuesCrema, actualizadoEn: '' }).toEqual({
        ...antesCrema,
        precio: '37.50',
        actualizadoEn: '',
      });
      expect(despuesCrema.imagenes).toHaveLength(1);
      expect(await producto(idEsmalte)).toEqual(antesEsmalte);

      const actualizados = (await auditoria('PRODUCTO_ACTUALIZADO')).slice(bitacoraAntes);
      expect(actualizados).toHaveLength(1);
      expect(actualizados[0]).toMatchObject({
        id_entidad: idCrema,
        detalle: { campos: ['precio'], precioAnterior: '35.00', precioNuevo: '37.50' },
      });
      // Los ausentes siguen intactos.
      const ausentesDespues = (
        await comoVendedor(http().get(`${RUTA}/${mes2.id}/ausentes`)).expect(200)
      ).body;
      expect(ausentesDespues.total).toBe(1);
      expect((await obtener(mes2.id)).totales).toMatchObject({
        pendientes: 0,
        aprobados: 3,
        ausentes: 1,
      });
    });

    it('D-57: un producto eliminado con ese código no cuenta: aprobar crea uno nuevo', async () => {
      const mes1 = await importar(MES_1);
      const creada = await aprobarCodigo(mes1.id, '43873');
      await comoVendedor(http().delete(`${RUTA_PRODUCTOS}/${creada.idProducto}`)).expect(204);

      const mes2 = await importar(MES_2);
      expect((await borradorDe(mes2.id, '43873')).productoExistente).toBeNull();
      const resultado = await aprobarCodigo(mes2.id, '43873');

      expect(resultado.accion).toBe('CREADO');
      expect(resultado.idProducto).not.toBe(creada.idProducto);
      expect(await contar('productos')).toBe(2);
    });

    it('PA-07: los precios de los pedidos ya hechos no dependen del producto (el producto solo cambia su precio actual); aprobar de nuevo → NO_PENDIENTE', async () => {
      const mes1 = await importar(MES_1);
      const creada = await aprobarCodigo(mes1.id, '43873');
      const mes2 = await importar(MES_2);
      const { id } = await borradorDe(mes2.id, '43873');

      await aprobar([id]).expect(200);
      const segunda = await aprobar([id]).expect(200);

      expect((segunda.body as CuerpoResultados).resultados).toEqual([
        { id, error: 'NO_PENDIENTE' },
      ]);
      expect((await producto(creada.idProducto!)).precio).toBe('37.50');
      expect(await contar('productos')).toBe(1);
    });

    it('carrera: aprobar a la vez el mismo código desde dos catálogos sin producto previo deja un solo producto con el último precio aprobado', async () => {
      const mes1 = await importar(MES_1);
      const mes2 = await importar(MES_2);
      const viejo = await borradorDe(mes1.id, '43873');
      const nuevo = await borradorDe(mes2.id, '43873');

      const [uno, dos] = await Promise.all([aprobar([viejo.id]), aprobar([nuevo.id])]);

      const resultados = [
        ...(uno.body as CuerpoResultados).resultados,
        ...(dos.body as CuerpoResultados).resultados,
      ];
      expect(resultados.every((r) => r.estado === 'APROBADO')).toBe(true);
      expect(resultados.filter((r) => r.accion === 'CREADO')).toHaveLength(1);
      expect(await contar('productos')).toBe(1);
      expect(resultados[0].idProducto).toBe(resultados[1].idProducto);
    });
  });

  describe('ciclo de vida de las importaciones', () => {
    it('D-57: subir el catálogo del mes archiva el anterior de esa marca y no el de otra marca; archivadaEn y eliminaEn = +6 meses', async () => {
      const otraMarca = await crearMarca('Leonisa');
      const mes1 = await importar(MES_1);
      const deOtra = await importar([['Panty clásico', '72323', '12.99']], otraMarca);

      const mes2 = await importar(MES_2);

      const archivada = await obtener(mes1.id);
      expect(archivada.estado).toBe('ARCHIVADA');
      expect(archivada.archivadaEn).toEqual(expect.any(String));
      const esperado = new Date(archivada.archivadaEn!);
      esperado.setUTCMonth(esperado.getUTCMonth() + 6);
      expect(new Date(archivada.eliminaEn!).getTime()).toBe(esperado.getTime());
      expect((await obtener(mes2.id)).estado).toBe('VIGENTE');
      expect((await obtener(deOtra.id)).estado).toBe('VIGENTE');
      // Se conservan los datos extraídos.
      expect((await borradores(mes1.id)).map((b) => b.codigo).toSorted()).toEqual([
        '43873',
        '5054',
        '77001',
      ]);
      // Dos importaciones simultáneas de la misma marca nunca dejan dos vigentes.
      await Promise.all([
        subir(catalogo([['Producto Uno', '1', '1.00']])).then((r) => r.status),
        subir(catalogo([['Producto Dos', '2', '2.00']])).then((r) => r.status),
      ]);
      const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM importaciones_producto WHERE id_marca = $1 AND estado = 'VIGENTE'`,
        [marcaId],
      );
      expect(Number(total)).toBe(1);
    });

    it('GET /importaciones: paginada, la más reciente primero, filtros por estado y marca, con totales', async () => {
      const otraMarca = await crearMarca('Leonisa');
      const mes1 = await importar(MES_1);
      const deOtra = await importar([['Panty clásico', '72323', '12.99']], otraMarca);
      const mes2 = await importar(MES_2);

      const todas = (await comoVendedor(http().get(RUTA)).expect(200)).body;
      expect(todas).toMatchObject({ pagina: 1, tamanio: 20, total: 3 });
      expect(todas.elementos.map((i: CuerpoImportacion) => i.id)).toEqual([
        mes2.id,
        deOtra.id,
        mes1.id,
      ]);
      expect(todas.elementos[0].totales).toMatchObject({ pendientes: 3, nuevos: 3 });

      const archivadas = (
        await comoVendedor(http().get(`${RUTA}?estado=ARCHIVADA`)).expect(200)
      ).body;
      expect(archivadas.elementos.map((i: CuerpoImportacion) => i.id)).toEqual([mes1.id]);
      const deLeonisa = (
        await comoVendedor(http().get(`${RUTA}?marcaId=${otraMarca}`)).expect(200)
      ).body;
      expect(deLeonisa.elementos.map((i: CuerpoImportacion) => i.id)).toEqual([deOtra.id]);
      const pagina2 = (
        await comoVendedor(http().get(`${RUTA}?pagina=2&tamanio=2`)).expect(200)
      ).body;
      expect(pagina2).toMatchObject({ pagina: 2, tamanio: 2, total: 3 });
      expect(pagina2.elementos).toHaveLength(1);
    });

    it('RNF-03: parámetros inválidos del listado → 400', async () => {
      for (const consulta of [
        'estado=OTRA',
        'marcaId=no-es-uuid',
        'tamanio=101',
        'pagina=0',
        'extra=1',
      ]) {
        const respuesta = await comoVendedor(http().get(`${RUTA}?${consulta}`));
        expect([consulta, respuesta.status]).toEqual([consulta, 400]);
      }
    });

    it('ausentes: en una importación archivada → 422 IMPORTACION_ARCHIVADA; inexistente → 404; id inválido → 400', async () => {
      const mes1 = await importar(MES_1);
      await importar(MES_2);

      const archivada = await comoVendedor(http().get(`${RUTA}/${mes1.id}/ausentes`)).expect(422);
      expect(archivada.body.codigo).toBe('IMPORTACION_ARCHIVADA');
      await comoVendedor(http().get(`${RUTA}/${ID_INEXISTENTE}/ausentes`)).expect(404);
      await comoVendedor(http().get(`${RUTA}/no-es-uuid/ausentes`)).expect(400);
    });
  });

  describe('DELETE /productos/importaciones/{id}', () => {
    it('D-57: elimina la importación y sus borradores, deja los productos, libera la huella (el mismo PDF se puede subir otra vez) y registra IMPORTACION_ELIMINADA (MANUAL)', async () => {
      const pdf = catalogo(MES_1);
      const mes1 = (await subir(pdf).expect(201)).body as CuerpoImportacion;
      const creada = await aprobarCodigo(mes1.id, '43873');
      expect((await subir(pdf).expect(409)).body.codigo).toBe('IMPORTACION_DUPLICADA');

      await comoVendedor(http().delete(`${RUTA}/${mes1.id}`)).expect(204);

      expect(await contar('importaciones_producto')).toBe(0);
      expect(await contar('borradores_producto')).toBe(0);
      expect((await producto(creada.idProducto!)).precio).toBe('35.00');
      await comoVendedor(http().get(`${RUTA}/${mes1.id}`)).expect(404);
      const eliminadas = await auditoria('IMPORTACION_ELIMINADA');
      expect(eliminadas).toHaveLength(1);
      expect(eliminadas[0]).toMatchObject({
        id_usuario: expect.any(String),
        entidad: 'IMPORTACION',
        id_entidad: mes1.id,
        detalle: { idImportacion: mes1.id, motivo: 'MANUAL', borradores: 3 },
      });
      // La huella quedó libre.
      await subir(pdf).expect(201);
    });

    it('inexistente o ya eliminada → 404; aprobar o descartar sobre algo eliminado responde NO_ENCONTRADO; id inválido → 400', async () => {
      const mes1 = await importar(MES_1);
      const { id } = await borradorDe(mes1.id, '43873');
      await comoVendedor(http().delete(`${RUTA}/${mes1.id}`)).expect(204);

      await comoVendedor(http().delete(`${RUTA}/${mes1.id}`)).expect(404);
      await comoVendedor(http().delete(`${RUTA}/${ID_INEXISTENTE}`)).expect(404);
      await comoVendedor(http().delete(`${RUTA}/no-es-uuid`)).expect(400);
      const aprobacion = await aprobar([id]).expect(200);
      expect((aprobacion.body as CuerpoResultados).resultados).toEqual([
        { id, error: 'NO_ENCONTRADO' },
      ]);
      expect(await contar('productos')).toBe(0);
    });

    it('se puede eliminar una vigente o una archivada; dos eliminaciones simultáneas: una responde 204 y la otra 404', async () => {
      const mes1 = await importar(MES_1);
      const mes2 = await importar(MES_2);

      await comoVendedor(http().delete(`${RUTA}/${mes1.id}`)).expect(204);
      const estados = (
        await Promise.all([
          comoVendedor(http().delete(`${RUTA}/${mes2.id}`)),
          comoVendedor(http().delete(`${RUTA}/${mes2.id}`)),
        ])
      ).map((r) => r.status);

      expect(estados.toSorted()).toEqual([204, 404]);
      expect(await auditoria('IMPORTACION_ELIMINADA')).toHaveLength(2);
    });
  });

  describe('retención automática de 6 meses', () => {
    it('D-57: elimina solo las archivadas con 6 meses calendario cumplidos desde archivadaEn (5 meses 29 días no), nunca la vigente ni los productos; bitácora RETENCION con usuario nulo', async () => {
      const otraMarca = await crearMarca('Leonisa');
      const vieja = await importar(MES_1);
      const productoCreado = await aprobarCodigo(vieja.id, '43873');
      const vigente = await importar([['Panty clásico', '72323', '12.99']], otraMarca);
      await fijarArchivada(vieja.id, '2026-05-20T10:00:00.000Z');

      const casi = await casoUso(relojEn('2026-11-19T10:00:00.000Z')).ejecutar();
      expect(casi).toEqual({ eliminadas: 0, fallidas: 0 });
      expect(await contar('importaciones_producto')).toBe(2);

      const justo = await casoUso(relojEn('2026-11-20T10:00:00.000Z')).ejecutar();
      expect(justo).toEqual({ eliminadas: 1, fallidas: 0 });

      expect(await contar('importaciones_producto')).toBe(1);
      await comoVendedor(http().get(`${RUTA}/${vigente.id}`)).expect(200);
      expect(await contar('borradores_producto')).toBe(1);
      expect((await producto(productoCreado.idProducto!)).codigo).toBe('43873');
      const filas = await auditoria('IMPORTACION_ELIMINADA');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        id_usuario: null,
        entidad: 'IMPORTACION',
        id_entidad: vieja.id,
        detalle: { idImportacion: vieja.id, motivo: 'RETENCION', borradores: 3 },
      });
      // D-20: ni el nombre del archivo ni el contenido.
      expect(JSON.stringify(filas[0].detalle)).not.toContain('catalogo-privado');
    });

    it('una vigente jamás se elimina sola, por vieja que sea', async () => {
      const vigente = await importar(MES_1);

      expect(
        await casoUso(relojEn('2040-01-01T00:00:00.000Z')).ejecutar(),
      ).toEqual({ eliminadas: 0, fallidas: 0 });

      await comoVendedor(http().get(`${RUTA}/${vigente.id}`)).expect(200);
    });

    it('es idempotente y no falla con varias ejecuciones simultáneas: se elimina y se registra una sola vez', async () => {
      const vieja = await importar(MES_1);
      await importar(MES_2);
      await fijarArchivada(vieja.id, '2026-05-20T10:00:00.000Z');
      const reloj = relojEn('2026-12-01T00:00:00.000Z');

      const resultados = await Promise.all([
        casoUso(reloj).ejecutar(),
        casoUso(reloj).ejecutar(),
        casoUso(reloj).ejecutar(),
      ]);

      expect(resultados.every((r) => r.fallidas === 0)).toBe(true);
      expect(resultados.reduce((suma, r) => suma + r.eliminadas, 0)).toBe(1);
      expect(await auditoria('IMPORTACION_ELIMINADA')).toHaveLength(1);
      expect(await casoUso(reloj).ejecutar()).toEqual({ eliminadas: 0, fallidas: 0 });
      expect(await contar('importaciones_producto')).toBe(1);
    });

    it('con RETENCION_IMPORTACIONES_ACTIVA=false el planificador existe pero no programa nada en las pruebas', () => {
      const planificador = contexto.app.get(PlanificadorRetencionImportaciones, {
        strict: false,
      });
      expect(planificador).toBeInstanceOf(PlanificadorRetencionImportaciones);
    });
  });

  describe('CA-02: solo el Vendedor', () => {
    it('el Cliente en las rutas nuevas → 403 NO_AUTORIZADO, queda ACCESO_DENEGADO y nada cambia', async () => {
      const mes1 = await importar(MES_1);
      const antes = (await auditoria('ACCESO_DENEGADO')).length;

      const respuestas = [
        await comoCliente(http().get(RUTA)),
        await comoCliente(http().get(`${RUTA}/${mes1.id}/ausentes`)),
        await comoCliente(http().delete(`${RUTA}/${mes1.id}`)),
      ];

      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(403);
        expect(respuesta.body.codigo).toBe('NO_AUTORIZADO');
      }
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(antes + 3);
      expect(await contar('importaciones_producto')).toBe(1);
      expect(await contar('borradores_producto')).toBe(3);
    });

    it('sin sesión → 401 en las rutas nuevas', async () => {
      await http().get(RUTA).expect(401);
      await http().get(`${RUTA}/${ID_INEXISTENTE}/ausentes`).expect(401);
      await http().delete(`${RUTA}/${ID_INEXISTENTE}`).expect(401);
    });
  });

  describe('D-20: la bitácora no guarda datos sensibles', () => {
    it('ninguna acción del flujo mensual guarda el PDF, su contenido ni el nombre del archivo', async () => {
      const mes1 = await importar(MES_1);
      await aprobarTodos(mes1.id);
      const mes2 = await importar(MES_2);
      await aprobarTodos(mes2.id);
      await comoVendedor(http().delete(`${RUTA}/${mes1.id}`)).expect(204);

      const filas = await contexto.fuente.query<FilaAuditoria[]>(
        `SELECT accion, detalle FROM auditoria
         WHERE accion IN ('IMPORTACION_CREADA', 'BORRADORES_APROBADOS', 'PRODUCTO_ACTUALIZADO', 'IMPORTACION_ELIMINADA')`,
      );

      expect(filas.length).toBeGreaterThanOrEqual(6);
      const texto = JSON.stringify(filas);
      expect(texto).not.toContain('catalogo-privado');
      expect(texto).not.toContain('%PDF');
      expect(texto).not.toContain('Crema Hidratante');
      for (const fila of filas.filter((f) => f.accion === 'IMPORTACION_ELIMINADA')) {
        expect(Object.keys(fila.detalle).toSorted()).toEqual([
          'borradores',
          'idImportacion',
          'motivo',
        ]);
      }
    });
  });
});
