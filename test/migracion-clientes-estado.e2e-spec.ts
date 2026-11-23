import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';
import { revertirHasta } from './preparacion/migraciones.js';

/**
 * e2e de la migración AgregarAccionesClienteEstadoAuditoria (D-53) contra
 * `catalogostock_pruebas` (D-23): sin diferencias entre entidades y esquema
 * (dryrun) y aplicar → revertir → aplicar. Las suites corren una a la vez.
 */
describe('Migración de acciones de clientes (e2e): enumerado, reversión y reaplicación', () => {
  let contexto: AppPruebas;

  async function acciones(): Promise<string[]> {
    const filas = await contexto.fuente.query<{ valor: string }[]>(
      `SELECT unnest(enum_range(NULL::accion_auditoria))::text AS valor`,
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
    expect(await acciones()).toEqual(
      expect.arrayContaining(['CLIENTE_DESACTIVADO', 'CLIENTE_REACTIVADO']),
    );
  });

  it('revertir quita las acciones nuevas y volver a aplicar deja el esquema sin diferencias', async () => {
    // Con acciones nuevas en la bitácora la reversión se niega (nunca borra
    // la bitácora): la base de pruebas se vacía antes.
    await contexto.limpiar();
    // Primero las tres migraciones posteriores (importación del catálogo y catálogos mensuales, D-57).
    await revertirHasta(
      contexto.fuente,
      'AgregarAccionesClienteEstadoAuditoria1794800000001',
    );
    const sinNuevas = await acciones();
    expect(sinNuevas).not.toContain('CLIENTE_DESACTIVADO');
    expect(sinNuevas).not.toContain('CLIENTE_REACTIVADO');
    expect(sinNuevas).toContain('SOLICITUD_RECUPERACION_IGNORADA');

    await contexto.fuente.runMigrations({ transaction: 'each' });
    expect(await acciones()).toEqual(
      expect.arrayContaining(['CLIENTE_DESACTIVADO', 'CLIENTE_REACTIVADO']),
    );
    expect(await diferenciasDeEsquema()).toEqual([]);
  });
});
