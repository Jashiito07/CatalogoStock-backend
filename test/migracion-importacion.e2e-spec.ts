import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de las migraciones de la importación del catálogo (CrearTablasImportacionProducto y
 * AgregarAccionesImportacionAuditoria; D-49) contra `catalogostock_pruebas`
 * (D-23): sin diferencias entre entidades y esquema (dryrun) y aplicar →
 * revertir → aplicar. Las suites corren una a la vez.
 */
describe('Migración de la importación del catálogo (e2e): tablas, enumerados, reversión y reaplicación', () => {
  let contexto: AppPruebas;

  async function tablas(): Promise<string[]> {
    const filas = await contexto.fuente.query<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    return filas.map((fila) => fila.tablename);
  }

  async function valores(tipo: string): Promise<string[]> {
    const filas = await contexto.fuente.query<{ valor: string }[]>(
      `SELECT unnest(enum_range(NULL::${tipo}))::text AS valor`,
    );
    return filas.map((fila) => fila.valor);
  }

  async function diferenciasDeEsquema(): Promise<string[]> {
    const sql = await contexto.fuente.driver.createSchemaBuilder().log();
    return sql.upQueries.map((consulta) => consulta.query);
  }

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  it('dryrun: las entidades y el esquema migrado no tienen diferencias', async () => {
    expect(await diferenciasDeEsquema()).toEqual([]);
    expect(await tablas()).toEqual(
      expect.arrayContaining(['importaciones_producto', 'borradores_producto']),
    );
    expect(await valores('estado_borrador')).toEqual([
      'PENDIENTE',
      'APROBADO',
      'DESCARTADO',
    ]);
    expect(await valores('accion_auditoria')).toEqual(
      expect.arrayContaining([
        'IMPORTACION_CREADA',
        'BORRADORES_APROBADOS',
        'BORRADORES_DESCARTADOS',
      ]),
    );
    expect(await valores('entidad_auditoria')).toContain('IMPORTACION');
  });

  it('el precio es numeric(7,2), la huella es única y el código admite letras y dígitos hasta 20', async () => {
    const [precio] = await contexto.fuente.query<
      { numeric_precision: number; numeric_scale: number }[]
    >(
      `SELECT numeric_precision, numeric_scale FROM information_schema.columns
       WHERE table_name = 'borradores_producto' AND column_name = 'precio'`,
    );
    expect(precio).toEqual({ numeric_precision: 7, numeric_scale: 2 });
    const [codigo] = await contexto.fuente.query<
      { character_maximum_length: number }[]
    >(
      `SELECT character_maximum_length FROM information_schema.columns
       WHERE table_name = 'borradores_producto' AND column_name = 'codigo'`,
    );
    expect(codigo.character_maximum_length).toBe(20);
    const indices = await contexto.fuente.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_importaciones_producto_huella'`,
    );
    expect(indices[0].indexdef).toContain('UNIQUE');
  });

  it('revertir quita tablas, enumerados y acciones; volver a aplicar deja el esquema sin diferencias', async () => {
    // Con acciones nuevas en la bitácora la reversión se niega (nunca borra la
    // bitácora): la base de pruebas se vacía antes.
    await contexto.limpiar();
    // La de los catálogos mensuales (D-57) va encima de las dos de la importación.
    await contexto.fuente.undoLastMigration({ transaction: 'each' });
    await contexto.fuente.undoLastMigration({ transaction: 'each' });
    await contexto.fuente.undoLastMigration({ transaction: 'each' });

    expect(await tablas()).not.toContain('borradores_producto');
    expect(await tablas()).not.toContain('importaciones_producto');
    expect(await valores('accion_auditoria')).not.toContain('IMPORTACION_CREADA');
    expect(await valores('entidad_auditoria')).not.toContain('IMPORTACION');
    // Lo anterior sigue intacto.
    expect(await tablas()).toContain('productos');
    expect(await valores('accion_auditoria')).toContain('CLIENTE_DESACTIVADO');

    await contexto.fuente.runMigrations({ transaction: 'each' });

    expect(await tablas()).toEqual(
      expect.arrayContaining(['importaciones_producto', 'borradores_producto']),
    );
    expect(await valores('accion_auditoria')).toContain('BORRADORES_DESCARTADOS');
    expect(await diferenciasDeEsquema()).toEqual([]);
  });
});
