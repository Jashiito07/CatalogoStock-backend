import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';
import { revertirHasta } from './preparacion/migraciones.js';

const MIGRACION_CATALOGO_MENSUAL =
  'AgregarCodigoProductoYCicloImportacion1795000000001';
const VENDEDOR = '00000000-0000-4000-8000-0000000000aa';

/**
 * e2e de la migración de los catálogos mensuales (AgregarCodigoProductoYCicloImportacion,
 * D-57) contra `catalogostock_pruebas` (D-23): dryrun sin diferencias, relleno
 * de `codigo` desde el sufijo «Cód. …», índice único parcial, estados de las
 * importaciones existentes y reversión. Las suites corren una a la vez.
 */
const p = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const h = (c: string) => c.repeat(64);

describe('Migración de los catálogos mensuales (e2e): código, relleno, estados, índices y reversión', () => {
  let contexto: AppPruebas;

  const MARCA_A = '00000000-0000-4000-8000-0000000000a1';
  const MARCA_B = '00000000-0000-4000-8000-0000000000a2';

  async function diferenciasDeEsquema(): Promise<string[]> {
    const sql = await contexto.fuente.driver.createSchemaBuilder().log();
    return sql.upQueries.map((consulta) => consulta.query);
  }

  async function valores(tipo: string): Promise<string[]> {
    const filas = await contexto.fuente.query<{ valor: string }[]>(
      `SELECT unnest(enum_range(NULL::${tipo}))::text AS valor`,
    );
    return filas.map((fila) => fila.valor);
  }

  async function columnas(tabla: string): Promise<string[]> {
    const filas = await contexto.fuente.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [tabla],
    );
    return filas.map((fila) => fila.column_name);
  }

  async function insertarProducto(
    id: string,
    marca: string,
    nombre: string,
    descripcion: string,
    creado: string,
    eliminado: string | null = null,
  ): Promise<void> {
    await contexto.fuente.query(
      `INSERT INTO productos (id, nombre, nombre_busqueda, id_marca, precio, descripcion,
                              descripcion_busqueda, eliminado_en, fecha_creacion)
       VALUES ($1, $2::varchar, lower($2::varchar), $3, 10.00, $4::varchar, translate(lower($4::varchar), 'ó', 'o'), $5, $6)`,
      [id, nombre, marca, descripcion, eliminado, creado],
    );
  }

  async function insertarImportacion(
    id: string,
    marca: string,
    huella: string,
    creada: string,
  ): Promise<void> {
    await contexto.fuente.query(
      `INSERT INTO importaciones_producto (id, nombre_archivo, huella, id_marca, paginas, fecha_creacion)
       VALUES ($1, 'c.pdf', $2, $3, 1, $4)`,
      [id, huella, marca, creada],
    );
  }

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  it('dryrun: las entidades y el esquema migrado no tienen diferencias; columnas, índices y enumerados existen', async () => {
    expect(await diferenciasDeEsquema()).toEqual([]);
    expect(await columnas('productos')).toContain('codigo');
    expect(await columnas('importaciones_producto')).toEqual(
      expect.arrayContaining(['estado', 'archivada_en']),
    );
    expect(await valores('estado_importacion')).toEqual(['VIGENTE', 'ARCHIVADA']);
    expect(await valores('accion_auditoria')).toContain('IMPORTACION_ELIMINADA');
    const indices = await contexto.fuente.query<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('uq_productos_marca_codigo', 'uq_importaciones_producto_vigente_marca')`,
    );
    const porNombre = Object.fromEntries(indices.map((i) => [i.indexname, i.indexdef]));
    expect(porNombre.uq_productos_marca_codigo).toContain('UNIQUE');
    expect(porNombre.uq_productos_marca_codigo).toContain('eliminado_en IS NULL');
    expect(porNombre.uq_importaciones_producto_vigente_marca).toContain("'VIGENTE'");
  });

  it('D-57: el índice único impide dos productos iguales en la marca; permite el mismo código en otra marca, sin código repetido y con un eliminado', async () => {
    await contexto.limpiar();
    await contexto.fuente.query(
      `INSERT INTO usuarios (id, nombre, correo, telefono, hash_clave, rol)
       VALUES ($1, 'Vendedor de Prueba', 'vendedor.migracion@ejemplo.test', '+593987654321', 'hash', 'VENDEDOR')`,
      [VENDEDOR],
    );
    for (const [id, nombre] of [
      [MARCA_A, 'Yanbal'],
      [MARCA_B, 'Leonisa'],
    ]) {
      await contexto.fuente.query(
        `INSERT INTO marcas (id, nombre, nombre_busqueda, color) VALUES ($1, $2::varchar, lower($2::varchar), '#2563EB')`,
        [id, nombre],
      );
    }
    const nuevo = (id: string, marca: string, codigo: string | null, eliminado: string | null) =>
      contexto.fuente.query(
        `INSERT INTO productos (id, id_vendedor, nombre, nombre_busqueda, id_marca, precio, codigo, eliminado_en)
         VALUES ($1, '${VENDEDOR}', 'Producto', 'producto', $2, 1.00, $3, $4)`,
        [id, marca, codigo, eliminado],
      );
    await nuevo('00000000-0000-4000-8000-000000000001', MARCA_A, '43873', null);

    await expect(
      nuevo('00000000-0000-4000-8000-000000000002', MARCA_A, '43873', null),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    await nuevo('00000000-0000-4000-8000-000000000003', MARCA_B, '43873', null);
    await nuevo('00000000-0000-4000-8000-000000000004', MARCA_A, null, null);
    await nuevo('00000000-0000-4000-8000-000000000005', MARCA_A, null, null);
    await nuevo('00000000-0000-4000-8000-000000000006', MARCA_A, '43873', '2026-01-01T00:00:00Z');
    await expect(
      nuevo('00000000-0000-4000-8000-000000000007', MARCA_A, 'con espacio', null),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('D-57: revertir devuelve «Cód. <código>» a la descripción y quita lo nuevo; volver a aplicar rellena el código, quita el sufijo y archiva las importaciones anteriores', async () => {
    await contexto.limpiar();
    // La reversión no borra la bitácora: con la base vacía, `down()` es seguro.
    await revertirHasta(contexto.fuente, MIGRACION_CATALOGO_MENSUAL);

    expect(await columnas('productos')).not.toContain('codigo');
    expect(await columnas('importaciones_producto')).not.toContain('estado');
    expect(await valores('accion_auditoria')).not.toContain('IMPORTACION_ELIMINADA');
    // Lo anterior sigue intacto.
    expect(await valores('accion_auditoria')).toContain('BORRADORES_DESCARTADOS');

    // D-60: la migración posterior (id_vendedor) rellena el dueño con el único Vendedor.
    await contexto.fuente.query(
      `INSERT INTO usuarios (id, nombre, correo, telefono, hash_clave, rol)
       VALUES ($1, 'Vendedor de Prueba', 'vendedor.migracion@ejemplo.test', '+593987654321', 'hash', 'VENDEDOR')`,
      [VENDEDOR],
    );

    // Datos «de antes» (D-55): el código iba al final de la descripción.
    for (const [id, nombre] of [
      [MARCA_A, 'Yanbal'],
      [MARCA_B, 'Leonisa'],
    ]) {
      await contexto.fuente.query(
        `INSERT INTO marcas (id, nombre, nombre_busqueda, color) VALUES ($1, $2::varchar, lower($2::varchar), '#2563EB')`,
        [id, nombre],
      );
    }
    await insertarProducto(p(1), MARCA_A, 'Crema', 'Cont. 50 ml Cód. 43873', '2026-01-01T00:00:00Z');
    await insertarProducto(p(2), MARCA_A, 'Esmalte', 'Cód. 5054', '2026-01-02T00:00:00Z');
    // Mismo código, misma marca, no eliminados: solo el más antiguo recibe la columna.
    await insertarProducto(p(3), MARCA_A, 'Crema repetida', 'Otra Cód. 43873', '2026-02-01T00:00:00Z');
    // Eliminado con el mismo código: recibe la columna sin chocar con el índice.
    await insertarProducto(p(4), MARCA_A, 'Crema borrada', 'Vieja Cód. 43873', '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z');
    // Misma marca distinta: el código es por marca.
    await insertarProducto(p(5), MARCA_B, 'Panty', 'Ref Cód. 43873', '2026-01-05T00:00:00Z');
    // Sin sufijo, o con un «Cód.» que no está al final: no se toca.
    await insertarProducto(p(6), MARCA_A, 'Sin código', 'Descripción normal', '2026-01-06T00:00:00Z');
    await insertarProducto(p(7), MARCA_A, 'Código en medio', 'Cód. 99 y más texto', '2026-01-07T00:00:00Z');
    // Importaciones: la más reciente de cada marca queda vigente.
    await insertarImportacion('00000000-0000-4000-8000-0000000002a1', MARCA_A, h('a'), '2026-05-01T00:00:00Z');
    await insertarImportacion('00000000-0000-4000-8000-0000000002a2', MARCA_A, h('b'), '2026-06-01T00:00:00Z');
    await insertarImportacion('00000000-0000-4000-8000-0000000002a3', MARCA_A, h('c'), '2026-07-01T00:00:00Z');
    await insertarImportacion('00000000-0000-4000-8000-0000000002b1', MARCA_B, h('d'), '2026-05-01T00:00:00Z');

    await contexto.fuente.runMigrations({ transaction: 'each' });

    const productos = await contexto.fuente.query<
      { id: string; codigo: string | null; descripcion: string; descripcion_busqueda: string }[]
    >(`SELECT id, codigo, descripcion, descripcion_busqueda FROM productos ORDER BY id`);
    const por = Object.fromEntries(productos.map((x) => [x.id, x]));
    expect(por[p(1)]).toMatchObject({ codigo: '43873', descripcion: 'Cont. 50 ml', descripcion_busqueda: 'cont. 50 ml' });
    expect(por[p(2)]).toMatchObject({ codigo: '5054', descripcion: '', descripcion_busqueda: '' });
    // El repetido conserva su descripción para que el Vendedor lo revise.
    expect(por[p(3)]).toMatchObject({ codigo: null, descripcion: 'Otra Cód. 43873' });
    expect(por[p(4)]).toMatchObject({ codigo: '43873', descripcion: 'Vieja' });
    expect(por[p(5)]).toMatchObject({ codigo: '43873', descripcion: 'Ref' });
    expect(por[p(6)]).toMatchObject({ codigo: null, descripcion: 'Descripción normal' });
    expect(por[p(7)]).toMatchObject({ codigo: null, descripcion: 'Cód. 99 y más texto' });

    const importaciones = await contexto.fuente.query<
      { id: string; estado: string; archivada_en: Date | null }[]
    >(`SELECT id, estado, archivada_en FROM importaciones_producto ORDER BY id`);
    const estados = Object.fromEntries(importaciones.map((i) => [i.id.slice(-2), i]));
    expect(estados.a1).toMatchObject({ estado: 'ARCHIVADA' });
    expect(estados.a2).toMatchObject({ estado: 'ARCHIVADA' });
    expect(estados.a3).toMatchObject({ estado: 'VIGENTE', archivada_en: null });
    expect(estados.b1).toMatchObject({ estado: 'VIGENTE', archivada_en: null });
    expect(estados.a1.archivada_en).toBeInstanceOf(Date);
    expect(await diferenciasDeEsquema()).toEqual([]);

    // Y de nuevo hacia atrás: el sufijo vuelve a la descripción.
    await revertirHasta(contexto.fuente, MIGRACION_CATALOGO_MENSUAL);
    const atras = await contexto.fuente.query<{ id: string; descripcion: string }[]>(
      `SELECT id, descripcion FROM productos ORDER BY id`,
    );
    const descripcion = Object.fromEntries(atras.map((x) => [x.id, x.descripcion]));
    expect(descripcion[p(1)]).toBe('Cont. 50 ml Cód. 43873');
    expect(descripcion[p(2)]).toBe('Cód. 5054');
    expect(descripcion[p(3)]).toBe('Otra Cód. 43873');
    expect(descripcion[p(6)]).toBe('Descripción normal');

    await contexto.fuente.runMigrations({ transaction: 'each' });
    expect(await diferenciasDeEsquema()).toEqual([]);
  });
});
