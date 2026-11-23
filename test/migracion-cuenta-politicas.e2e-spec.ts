import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';
import { revertirHasta } from './preparacion/migraciones.js';

/**
 * e2e de las migraciones del contrato cuenta-y-politicas (RF-USU-06, RF-USU-08,
 * D-60) contra `catalogostock_pruebas` (D-23): dryrun sin diferencias, aditivas,
 * con `down()`, relleno de `id_vendedor` con el único Vendedor y fallo claro sin
 * Vendedor. Las suites corren una a la vez.
 */
const MIGRACION_CUENTA = 'AgregarEliminacionCuentaYPerfilVendedor1795100000001';
const MIGRACION_VENDEDOR = 'AgregarIdVendedorProductosEImportaciones1795100000002';
const VENDEDOR = '00000000-0000-4000-8000-0000000000aa';
const MARCA = '00000000-0000-4000-8000-0000000000a1';
const CLIENTE = '00000000-0000-4000-8000-0000000000c1';

describe('Migraciones de cuenta, perfil y dueño del producto (e2e)', () => {
  let contexto: AppPruebas;

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
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [tabla],
    );
    return filas.map((fila) => fila.column_name);
  }

  const insertarVendedor = () =>
    contexto.fuente.query(
      `INSERT INTO usuarios (id, nombre, correo, telefono, hash_clave, rol)
       VALUES ($1, 'Vendedor de Prueba', 'vendedor.migracion@ejemplo.test', '+593987654321', 'hash', 'VENDEDOR')`,
      [VENDEDOR],
    );

  const insertarMarcaYProducto = async (conDueno: boolean) => {
    await contexto.fuente.query(
      `INSERT INTO marcas (id, nombre, nombre_busqueda, color) VALUES ($1, 'Yanbal', 'yanbal', '#2563EB')`,
      [MARCA],
    );
    await contexto.fuente.query(
      conDueno
        ? `INSERT INTO productos (id, id_vendedor, nombre, nombre_busqueda, id_marca, precio) VALUES ('00000000-0000-4000-8000-000000000001', '${VENDEDOR}', 'P', 'p', $1, 1.00)`
        : `INSERT INTO productos (id, nombre, nombre_busqueda, id_marca, precio) VALUES ('00000000-0000-4000-8000-000000000001', 'P', 'p', $1, 1.00)`,
      [MARCA],
    );
  };

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  it('dryrun: las entidades y el esquema migrado no tienen diferencias; lo nuevo existe', async () => {
    expect(await diferenciasDeEsquema()).toEqual([]);
    expect(await columnas('usuarios')).toContain('eliminado_en');
    expect(await columnas('perfiles_vendedor')).toEqual(
      expect.arrayContaining(['id_usuario', 'nombre_comercial', 'ciudad', 'provincia', 'whatsapp', 'actualizado_en']),
    );
    expect(await columnas('productos')).toContain('id_vendedor');
    expect(await columnas('importaciones_producto')).toContain('id_vendedor');
    expect(await valores('proposito_codigo')).toContain('ELIMINACION_CUENTA');
    expect(await valores('accion_auditoria')).toEqual(
      expect.arrayContaining(['CUENTA_ELIMINADA', 'PERFIL_VENDEDOR_ACTUALIZADO']),
    );
    const indices = await contexto.fuente.query<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('uq_productos_marca_codigo', 'uq_importaciones_producto_vigente_marca', 'uq_importaciones_producto_huella')`,
    );
    const por = Object.fromEntries(indices.map((i) => [i.indexname, i.indexdef]));
    expect(por.uq_productos_marca_codigo).toContain('(id_vendedor, id_marca, codigo)');
    expect(por.uq_importaciones_producto_vigente_marca).toContain('(id_vendedor, id_marca)');
    expect(por.uq_importaciones_producto_huella).toContain('(id_vendedor, huella)');
  });

  it('el teléfono anonimizado solo se admite en una cuenta eliminada, y esta siempre inactiva', async () => {
    await contexto.limpiar();
    const insertar = (telefono: string, eliminado: string | null, activo: boolean) =>
      contexto.fuente.query(
        `INSERT INTO usuarios (id, nombre, correo, telefono, hash_clave, rol, activo, eliminado_en,
                               fecha_aceptacion_privacidad, version_privacidad)
         VALUES ($1::uuid, 'N', $5::varchar, $2, 'h', 'CLIENTE', $3, $4, now(), '2026-11-1')`,
        [
          `00000000-0000-4000-8000-${telefono.slice(-12)}`,
          telefono,
          activo,
          eliminado,
          `c${telefono.slice(-4)}@ejemplo.test`,
        ],
      );
    await expect(insertar('+000123456791', null, true)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(insertar('+000123456792', '2026-11-18T10:00:00Z', true)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await insertar('+000123456793', '2026-11-18T10:00:00Z', false);
  });

  it('revertir quita lo nuevo; volver a aplicar rellena id_vendedor con el único Vendedor y el esquema queda sin diferencias', async () => {
    await contexto.limpiar();
    await revertirHasta(contexto.fuente, MIGRACION_CUENTA);
    expect(await columnas('usuarios')).not.toContain('eliminado_en');
    expect(await columnas('productos')).not.toContain('id_vendedor');
    expect(await columnas('importaciones_producto')).not.toContain('id_vendedor');
    expect(await valores('proposito_codigo')).not.toContain('ELIMINACION_CUENTA');
    expect(await valores('accion_auditoria')).not.toContain('CUENTA_ELIMINADA');
    // Lo anterior sigue intacto.
    expect(await valores('proposito_codigo')).toContain('VERIFICACION_CORREO');
    expect(await valores('accion_auditoria')).toContain('IMPORTACION_ELIMINADA');

    await insertarVendedor();
    await insertarMarcaYProducto(false);
    await contexto.fuente.runMigrations({ transaction: 'each' });

    const [producto] = await contexto.fuente.query<{ id_vendedor: string }[]>(
      `SELECT id_vendedor FROM productos`,
    );
    expect(producto.id_vendedor).toBe(VENDEDOR);
    expect(await diferenciasDeEsquema()).toEqual([]);
  });

  it('con productos y sin Vendedor, la migración falla con un mensaje claro y no cambia nada', async () => {
    await contexto.limpiar();
    await revertirHasta(contexto.fuente, MIGRACION_VENDEDOR);
    await insertarMarcaYProducto(false);

    await expect(contexto.fuente.runMigrations({ transaction: 'each' })).rejects.toThrow(
      /exactamente un Vendedor/,
    );
    expect(await columnas('productos')).not.toContain('id_vendedor');

    await contexto.limpiar();
    await contexto.fuente.runMigrations({ transaction: 'each' });
    expect(await diferenciasDeEsquema()).toEqual([]);
  });

  it('con las tablas vacías la columna queda NOT NULL aunque no haya Vendedor', async () => {
    await contexto.limpiar();
    await revertirHasta(contexto.fuente, MIGRACION_VENDEDOR);
    await contexto.fuente.runMigrations({ transaction: 'each' });
    const [fila] = await contexto.fuente.query<{ is_nullable: string }[]>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'id_vendedor'`,
    );
    expect(fila.is_nullable).toBe('NO');
  });

  it('no se puede revertir si hay cuentas eliminadas (sus datos ya no existen) y nada cambia', async () => {
    await contexto.limpiar();
    await contexto.fuente.query(
      `INSERT INTO usuarios (id, nombre, correo, telefono, hash_clave, rol, activo, eliminado_en,
                             fecha_aceptacion_privacidad, version_privacidad)
       VALUES ($1, 'Cuenta eliminada', 'eliminada-x@eliminada.invalid', '+000123456789', 'h', 'CLIENTE', false, now(), now(), '2026-11-1')`,
      [CLIENTE],
    );
    await expect(revertirHasta(contexto.fuente, MIGRACION_CUENTA)).rejects.toThrow(
      /cuentas eliminadas/,
    );
    expect(await columnas('usuarios')).toContain('eliminado_en');
    // La reversión de `id_vendedor` (posterior) sí se hizo: se vuelve a aplicar.
    await contexto.limpiar();
    await contexto.fuente.runMigrations({ transaction: 'each' });
    expect(await diferenciasDeEsquema()).toEqual([]);
  });
});
