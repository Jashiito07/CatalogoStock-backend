import request from 'supertest';
import {
  type LineaSintetica,
  crearPdfSintetico,
} from '../src/modulos/importacion/infraestructura/pdf/pdf-sintetico.prueba-spec.js';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e del emparejado por nombre de los borradores sin código y del filtro
 * `accion` (D-57; contrato `productos-importacion`, «Actualizar precios al
 * aprobar» y `GET .../borradores`) contra `catalogostock_pruebas` (D-23). Los
 * PDF son sintéticos y los datos, ficticios.
 */

const RUTA = '/api/v1/productos/importaciones';
const RUTA_PRODUCTOS = '/api/v1/productos';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.nombre@ejemplo.test';

interface CuerpoBorrador {
  id: string;
  codigo: string | null;
  nombre: string;
  precio: string | null;
  advertencias: string[];
  productoExistente: { id: string; nombre: string; precio: string } | null;
  emparejadoPor: 'CODIGO' | 'NOMBRE' | null;
}

interface Resultado {
  id: string;
  estado?: string;
  idProducto?: string;
  accion?: string;
  emparejadoPor?: string | null;
  error?: string;
}

interface CuerpoProducto {
  id: string;
  nombre: string;
  codigo: string | null;
  precio: string;
}

type Item = [nombre: string, codigo: string | null, precio: string];

/** Catálogo sintético estilo Yanbal; un producto sin código no lleva la línea «CÓD.». */
function catalogo(items: readonly Item[]): Buffer {
  const lineas: LineaSintetica[] = [];
  items.forEach(([nombre, codigo, precio], i) => {
    const y = 100 + i * 100;
    lineas.push(
      { texto: nombre, x: 50, y },
      { texto: `OFERTA US$ ${precio}`, x: 50, y: y + 12 },
    );
    if (codigo !== null) {
      lineas.push({ texto: `CÓD. ${codigo}`, x: 50, y: y + 24 });
    }
    lineas.push({ texto: `Pág. ${i + 3}`, x: 50, y: y + 34 });
  });
  return crearPdfSintetico([lineas]);
}

const MES_1: Item[] = [
  ['Jabón Líquido Avena', null, '5.50'],
  ['Crema Hidratante Mani', '43873', '35.00'],
  ['Toalla Facial Suave', null, '3.00'],
];

function conToken<T extends { set(c: string, v: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

describe('D-57 (e2e): emparejado por nombre y filtro accion', () => {
  let contexto: AppPruebas;
  let token: string;
  let marcaId: string;

  const http = () => request(contexto.app.getHttpServer());
  const vendedor = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, token);

  const importar = async (items: readonly Item[]): Promise<string> =>
    (
      await vendedor(http().post(RUTA))
        .field('marcaId', marcaId)
        .attach('archivo', catalogo(items), {
          filename: 'catalogo.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body.id as string;

  const listar = async (id: string, consulta = ''): Promise<{ elementos: CuerpoBorrador[]; total: number }> =>
    (
      await vendedor(
        http().get(
          `${RUTA}/${id}/borradores?${
            consulta.includes('tamanio') ? consulta.slice(1) : `tamanio=100${consulta}`
          }`,
        ),
      ).expect(200)
    ).body;

  const borradorDe = async (id: string, nombre: string): Promise<CuerpoBorrador> => {
    const encontrado = (await listar(id)).elementos.find((b) => b.nombre === nombre);
    if (encontrado === undefined) {
      throw new Error(`No hay borrador «${nombre}»`);
    }
    return encontrado;
  };

  const aprobar = async (ids: string[]): Promise<Resultado[]> =>
    (await vendedor(http().post(`${RUTA}/borradores/aprobar`)).send({ ids }).expect(200))
      .body.resultados as Resultado[];

  const aprobarTodos = async (id: string): Promise<Resultado[]> =>
    aprobar((await listar(id)).elementos.map((b) => b.id));

  const producto = async (id: string): Promise<CuerpoProducto> =>
    (await vendedor(http().get(`${RUTA_PRODUCTOS}/${id}`)).expect(200)).body;

  async function contar(tabla: string): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM ${tabla}`,
    );
    return Number(total);
  }

  const crearProducto = async (cuerpo: object): Promise<CuerpoProducto> =>
    (
      await vendedor(http().post(RUTA_PRODUCTOS))
        .send({ marcaId, precio: '10.00', ...cuerpo })
        .expect(201)
    ).body;

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  beforeEach(async () => {
    await contexto.limpiar();
    await contexto.app.get(CrearVendedorCasoUso).ejecutar({
      nombre: 'Vendedor Nombre',
      correo: CORREO_VENDEDOR,
      telefono: '0987654321',
      clave: CLAVE_VENDEDOR,
    });
    token = (
      await http()
        .post('/api/v1/autenticacion/ingreso/vendedor')
        .send({ correo: CORREO_VENDEDOR, clave: CLAVE_VENDEDOR })
        .expect(200)
    ).body.tokenAcceso as string;
    marcaId = (
      await vendedor(http().post('/api/v1/marcas'))
        .send({ nombre: 'Yanbal', color: '#2563EB' })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('el mismo catálogo dos meses seguidos', () => {
    it('no crea repetidos de productos sin código: se emparejan por nombre (sin mayúsculas, tildes ni signos) y solo cambia el precio', async () => {
      const mes1 = await importar(MES_1);
      const primeros = await aprobarTodos(mes1);
      expect(primeros.map((r) => r.accion)).toEqual(['CREADO', 'CREADO', 'CREADO']);
      expect(await contar('productos')).toBe(3);
      const idJabon = primeros[0].idProducto!;
      const antes = await producto(idJabon);
      expect(antes.codigo).toBeNull();

      const mes2 = await importar([
        ['JABÓN, líquido (avena).', null, '6.00'],
        ['Crema Hidratante Mani', '43873', '37.00'],
        ['Toalla Facial Suave', null, '3.00'],
      ]);

      const jabon = await borradorDe(mes2, 'JABÓN, líquido (avena).');
      expect(jabon).toMatchObject({
        emparejadoPor: 'NOMBRE',
        productoExistente: { id: idJabon, nombre: 'Jabón Líquido Avena', precio: '5.50' },
      });
      expect(jabon.advertencias).toContain('EMPAREJADO_POR_NOMBRE');
      expect(jabon.advertencias).not.toContain('YA_IMPORTADO');
      expect((await borradorDe(mes2, 'Crema Hidratante Mani')).emparejadoPor).toBe('CODIGO');
      const totales = (await vendedor(http().get(`${RUTA}/${mes2}`)).expect(200)).body.totales;
      expect(totales).toMatchObject({ pendientes: 3, actualizaran: 3, nuevos: 0 });

      const segundos = await aprobarTodos(mes2);

      expect(segundos.map((r) => [r.accion, r.emparejadoPor])).toEqual([
        ['ACTUALIZADO', 'NOMBRE'],
        ['ACTUALIZADO', 'CODIGO'],
        ['SIN_CAMBIO', 'NOMBRE'],
      ]);
      // Un producto por nombre: no hay repetidos.
      expect(await contar('productos')).toBe(3);
      const despues = await producto(idJabon);
      expect(despues).toEqual({ ...antes, precio: '6.00', actualizadoEn: expect.any(String) });
      expect(despues.codigo).toBeNull();
      const bitacora = await contexto.fuente.query<{ id_entidad: string; detalle: Record<string, unknown> }[]>(
        `SELECT id_entidad, detalle FROM auditoria WHERE accion = 'PRODUCTO_ACTUALIZADO' AND id_entidad = $1`,
        [idJabon],
      );
      expect(bitacora).toHaveLength(1);
      expect(bitacora[0].detalle).toMatchObject({
        campos: ['precio'],
        precioAnterior: '5.50',
        precioNuevo: '6.00',
      });
    });
  });

  describe('reglas del emparejado por nombre', () => {
    it('ambiguo: varios productos sin código con ese nombre → sin productoExistente, EMPAREJAMIENTO_AMBIGUO y al aprobar se crea uno nuevo', async () => {
      await crearProducto({ nombre: 'Jabón Líquido Avena' });
      await crearProducto({ nombre: 'jabon liquido avena!' });
      const mes = await importar([['Jabón Líquido Avena', null, '5.50']]);

      const borrador = await borradorDe(mes, 'Jabón Líquido Avena');
      expect(borrador.productoExistente).toBeNull();
      expect(borrador.emparejadoPor).toBeNull();
      expect(borrador.advertencias).toContain('EMPAREJAMIENTO_AMBIGUO');
      expect(
        (await vendedor(http().get(`${RUTA}/${mes}`)).expect(200)).body.totales,
      ).toMatchObject({ actualizaran: 0, nuevos: 1 });

      const [resultado] = await aprobar([borrador.id]);

      expect(resultado).toMatchObject({ accion: 'CREADO', emparejadoPor: null });
      expect(await contar('productos')).toBe(3);
    });

    it('nunca se empareja con un producto que tiene código, y un borrador con código nunca se empareja por nombre', async () => {
      const conCodigo = await crearProducto({ nombre: 'Jabón Líquido Avena', codigo: 'K1' });
      const sinCodigo = await crearProducto({ nombre: 'Crema Hidratante Mani', precio: '20.00' });
      const mes = await importar([
        ['Jabón Líquido Avena', null, '5.50'],
        ['Crema Hidratante Mani', '43873', '35.00'],
      ]);

      const jabon = await borradorDe(mes, 'Jabón Líquido Avena');
      const crema = await borradorDe(mes, 'Crema Hidratante Mani');
      expect(jabon.productoExistente).toBeNull();
      expect(jabon.advertencias).not.toContain('EMPAREJAMIENTO_AMBIGUO');
      expect(crema.productoExistente).toBeNull();

      const resultados = await aprobar([jabon.id, crema.id]);

      expect(resultados.map((r) => r.accion)).toEqual(['CREADO', 'CREADO']);
      expect((await producto(conCodigo.id)).precio).toBe('10.00');
      expect((await producto(sinCodigo.id)).precio).toBe('20.00');
      expect(await contar('productos')).toBe(4);
    });

    it('un borrador con NOMBRE_DUDOSO no se empareja por nombre; un producto eliminado no cuenta', async () => {
      await crearProducto({ nombre: 'Ab' });
      const borrado = await crearProducto({ nombre: 'Toalla Facial Suave' });
      await vendedor(http().delete(`${RUTA_PRODUCTOS}/${borrado.id}`)).expect(204);
      const mes = await importar([
        ['Ab', null, '1.00'],
        ['Toalla Facial Suave', null, '3.00'],
      ]);

      const corto = await borradorDe(mes, 'Ab');
      const toalla = await borradorDe(mes, 'Toalla Facial Suave');
      expect(corto.advertencias).toContain('NOMBRE_DUDOSO');
      expect(corto.productoExistente).toBeNull();
      expect(toalla.productoExistente).toBeNull();
      expect((await aprobar([corto.id, toalla.id])).map((r) => r.accion)).toEqual([
        'CREADO',
        'CREADO',
      ]);
    });

    it('carrera: aprobar a la vez el mismo nombre sin código desde dos catálogos deja un solo producto', async () => {
      const mes1 = await importar([['Toalla Facial Suave', null, '3.00']]);
      const mes2 = await importar([['Toalla Facial Suave', null, '3.50']]);
      const uno = await borradorDe(mes1, 'Toalla Facial Suave');
      const dos = await borradorDe(mes2, 'Toalla Facial Suave');

      const [a, b] = await Promise.all([aprobar([uno.id]), aprobar([dos.id])]);

      const resultados = [...a, ...b];
      expect(resultados.every((r) => r.estado === 'APROBADO')).toBe(true);
      expect(resultados.filter((r) => r.accion === 'CREADO')).toHaveLength(1);
      expect(await contar('productos')).toBe(1);
    });
  });

  async function preparar(): Promise<string> {
    await crearProducto({ nombre: 'Crema Hidratante Mani', codigo: '43873', precio: '30.00' });
    await crearProducto({ nombre: 'Jabón Líquido Avena', precio: '5.50' });
    return importar([
      ...MES_1,
      ['Labial Mate Rojo', null, '6.00'],
      ['Esmalte Color Rosa', '5054', '8.00'],
    ]);
  }

    describe('GET .../borradores: filtro accion', () => {

    it('ACTUALIZAR, NUEVO y CAMBIO_PRECIO reflejan el emparejado por código y por nombre', async () => {
      const mes = await preparar();

      const actualizar = await listar(mes, '&accion=ACTUALIZAR');
      const nuevos = await listar(mes, '&accion=NUEVO');
      const cambio = await listar(mes, '&accion=CAMBIO_PRECIO');

      expect(actualizar.elementos.map((b) => b.nombre).toSorted()).toEqual([
        'Crema Hidratante Mani',
        'Jabón Líquido Avena',
      ]);
      expect(nuevos.elementos.map((b) => b.nombre).toSorted()).toEqual([
        'Esmalte Color Rosa',
        'Labial Mate Rojo',
        'Toalla Facial Suave',
      ]);
      // La crema sube de 30.00 a 35.00; el jabón sigue en 5.50 (SIN_CAMBIO).
      expect(cambio.elementos.map((b) => b.nombre)).toEqual(['Crema Hidratante Mani']);
      expect(actualizar.total + nuevos.total).toBe(5);
    });

    it('se combina con la paginación en el servidor, la búsqueda (nombre o código), conAdvertencias y paginaPdf', async () => {
      const mes = await preparar();

      const pagina1 = await listar(mes, '&accion=NUEVO&tamanio=2');
      const pagina2 = await listar(mes, '&accion=NUEVO&tamanio=2&pagina=2');
      expect(pagina1.total).toBe(3);
      expect(pagina1.elementos).toHaveLength(2);
      expect(pagina2.elementos).toHaveLength(1);
      expect([...pagina1.elementos, ...pagina2.elementos].map((b) => b.nombre).toSorted()).toEqual([
        'Esmalte Color Rosa',
        'Labial Mate Rojo',
        'Toalla Facial Suave',
      ]);

      expect((await listar(mes, '&accion=NUEVO&busqueda=5054')).elementos.map((b) => b.nombre)).toEqual([
        'Esmalte Color Rosa',
      ]);
      expect((await listar(mes, '&busqueda=43873')).elementos.map((b) => b.nombre)).toEqual([
        'Crema Hidratante Mani',
      ]);
      expect((await listar(mes, '&accion=ACTUALIZAR&busqueda=jabon')).total).toBe(1);
      expect((await listar(mes, '&accion=ACTUALIZAR&busqueda=toalla')).total).toBe(0);
      // Los de código no piden revisión; los sin código (SIN_CODIGO) sí.
      expect(
        (await listar(mes, '&accion=ACTUALIZAR&conAdvertencias=false')).elementos.map((b) => b.nombre),
      ).toEqual(['Crema Hidratante Mani']);
      expect((await listar(mes, '&accion=NUEVO&paginaPdf=99')).total).toBe(0);
    });

    it('solo los pendientes cumplen una acción; otro valor de accion → 400', async () => {
      const mes = await preparar();
      const toalla = await borradorDe(mes, 'Toalla Facial Suave');
      await aprobar([toalla.id]);

      expect((await listar(mes, '&estado=APROBADO&accion=NUEVO')).total).toBe(0);
      expect((await listar(mes, '&accion=NUEVO')).elementos.map((b) => b.nombre)).not.toContain(
        'Toalla Facial Suave',
      );
      for (const accion of ['OTRA', 'nuevo', '', 'ACTUALIZAR,NUEVO']) {
        const respuesta = await vendedor(
          http().get(`${RUTA}/${mes}/borradores?accion=${accion}`),
        );
        expect([accion, respuesta.status, respuesta.body.codigo]).toEqual([
          accion,
          400,
          'DATOS_INVALIDOS',
        ]);
      }
    });
  });

  it('CA-02: el Cliente no usa el filtro accion (403)', async () => {
    const mes = await importar(MES_1);
    await http()
      .post('/api/v1/usuarios/registro')
      .send({
        nombre: 'Rosa Intriago',
        correo: 'cliente.nombre@ejemplo.test',
        telefono: '0991234567',
        clave: 'Catalogo2026',
        aceptaPrivacidad: true,
        versionPrivacidad: '2026-11-1',
      })
      .expect(201);
    const cliente = (
      await http()
        .post('/api/v1/autenticacion/ingreso/cliente')
        .send({ correo: 'cliente.nombre@ejemplo.test', clave: 'Catalogo2026' })
        .expect(200)
    ).body.tokenAcceso as string;

    const respuesta = await conToken(
      http().get(`${RUTA}/${mes}/borradores?accion=NUEVO`),
      cliente,
    );

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.codigo).toBe('NO_AUTORIZADO');
  });
});
