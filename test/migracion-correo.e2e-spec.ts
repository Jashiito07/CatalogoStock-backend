import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la migración AgregarCorreoVerificadoYPropositoCodigos (D-50) contra
 * `catalogostock_pruebas` (D-23): sin diferencias entre entidades y esquema
 * (dryrun), y aplicar → revertir → aplicar. Las suites corren una a la vez.
 */
describe('Migración del correo (e2e): esquema, reversión y reaplicación', () => {
  let contexto: AppPruebas;

  async function diferenciasDeEsquema(): Promise<string[]> {
    const sql = await contexto.fuente.driver.createSchemaBuilder().log();
    return sql.upQueries.map((consulta) => consulta.query);
  }

  async function columnas(tabla: string): Promise<string[]> {
    const filas = await contexto.fuente.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tabla],
    );
    return filas.map((fila) => fila.column_name);
  }

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  it('dryrun: las entidades y el esquema migrado no tienen diferencias', async () => {
    expect(await diferenciasDeEsquema()).toEqual([]);
  });

  it('aplicar, revertir y volver a aplicar deja el esquema correcto y sin diferencias', async () => {
    expect(await columnas('usuarios')).toContain('correo_verificado_en');
    expect(await columnas('codigos_recuperacion')).toContain('proposito');

    // Con acciones nuevas en la bitácora la reversión se niega (nunca borra la
    // bitácora): la base de pruebas se vacía antes.
    await contexto.limpiar();
    // Primero se revierte la migración posterior (acciones de clientes, D-53)
    // y después la del correo.
    await contexto.fuente.undoLastMigration({ transaction: 'each' });
    await contexto.fuente.undoLastMigration({ transaction: 'each' });
    expect(await columnas('usuarios')).not.toContain('correo_verificado_en');
    expect(await columnas('codigos_recuperacion')).not.toContain('proposito');
    const acciones = await contexto.fuente.query<{ valor: string }[]>(
      `SELECT unnest(enum_range(NULL::accion_auditoria))::text AS valor`,
    );
    expect(acciones.map((a) => a.valor)).not.toContain('CORREO_VERIFICADO');

    await contexto.fuente.runMigrations({ transaction: 'each' });
    expect(await columnas('usuarios')).toContain('correo_verificado_en');
    expect(await columnas('codigos_recuperacion')).toContain('proposito');
    expect(await diferenciasDeEsquema()).toEqual([]);
  });
});
