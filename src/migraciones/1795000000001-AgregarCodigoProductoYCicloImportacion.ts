import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Catálogos anteriores de la bitácora, para `down()`. */
const ACCIONES_ANTERIORES = [
  'USUARIO_REGISTRADO',
  'VENDEDOR_CREADO',
  'SESION_INICIADA',
  'SESION_FALLIDA',
  'SESION_CERRADA',
  'SESION_REUTILIZACION_DETECTADA',
  'ACCESO_DENEGADO',
  'CODIGO_RECUPERACION_GENERADO',
  'CLAVE_RESTABLECIDA',
  'RECUPERACION_FALLIDA',
  'CLAVE_CAMBIADA',
  'CORREO_VERIFICADO',
  'CODIGO_CORREO_ENVIADO',
  'SOLICITUD_RECUPERACION_IGNORADA',
  'CLIENTE_DESACTIVADO',
  'CLIENTE_REACTIVADO',
  'MARCA_CREADA',
  'MARCA_ACTUALIZADA',
  'PRODUCTO_CREADO',
  'PRODUCTO_ACTUALIZADO',
  'PRODUCTO_ELIMINADO',
  'IMAGEN_AGREGADA',
  'IMAGEN_ELIMINADA',
  'IMPORTACION_CREADA',
  'BORRADORES_APROBADOS',
  'BORRADORES_DESCARTADOS',
  'PAGO_VERIFICADO',
  'PEDIDO_ESTADO_CAMBIADO',
] as const;

function lista(valores: readonly string[]): string {
  return valores.map((valor) => `'${valor}'`).join(', ');
}

/**
 * Catálogos mensuales (D-57; contrato `productos-importacion`). **Aditiva**:
 * no borra tablas ni columnas ni datos.
 *
 * 1. `productos.codigo` (varchar(20), nulo): «CÓD.»/«Ref.» del catálogo, letras
 *    y dígitos. Índice único parcial `(id_marca, codigo)` entre los productos
 *    no eliminados con código.
 * 2. Relleno: los productos cuya descripción termina en `Cód. <código>` (así
 *    los creaba la importación de D-55) pasan ese código a la columna y se
 *    les quita el sufijo de la descripción y de `descripcion_busqueda`. Si dos
 *    productos **no eliminados** de la misma marca traen el mismo código, solo
 *    el más antiguo recibe la columna (el índice único no admite dos); el otro
 *    conserva su descripción tal cual para que el Vendedor lo revise.
 * 3. `importaciones_producto.estado` (`estado_importacion`: `VIGENTE` o
 *    `ARCHIVADA`) y `archivada_en`. De las importaciones existentes, la más
 *    reciente de cada marca queda `VIGENTE` y las demás `ARCHIVADA` con
 *    `archivada_en` = ahora (los 6 meses de retención cuentan desde esta
 *    migración). Índice único parcial: una sola `VIGENTE` por marca.
 * 4. Acción de bitácora `IMPORTACION_ELIMINADA` (entidad `IMPORTACION`).
 *
 * `down()` devuelve el código al final de la descripción (`Cód. <código>`) y
 * quita las columnas, los índices y el enumerado nuevos. Nunca borra la
 * bitácora: si ya hay filas con `IMPORTACION_ELIMINADA`, la conversión del
 * enumerado falla y toda la reversión se deshace.
 */
export class AgregarCodigoProductoYCicloImportacion1795000000001 implements MigrationInterface {
  name = 'AgregarCodigoProductoYCicloImportacion1795000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Código del producto.
    await queryRunner.query(
      `ALTER TABLE "productos" ADD "codigo" character varying(20)`,
    );

    // 2. Relleno desde el sufijo «Cód. <código>» de la descripción.
    await queryRunner.query(`
      WITH candidatos AS (
        SELECT
          id,
          eliminado_en,
          substring(descripcion from '(?:^|\\s)Cód\\. ([A-Za-z0-9]{1,20})$') AS codigo,
          row_number() OVER (
            PARTITION BY id_marca,
                         substring(descripcion from '(?:^|\\s)Cód\\. ([A-Za-z0-9]{1,20})$'),
                         (eliminado_en IS NULL)
            ORDER BY fecha_creacion, id
          ) AS orden
        FROM "productos"
        WHERE descripcion ~ '(^|\\s)Cód\\. [A-Za-z0-9]{1,20}$'
      )
      UPDATE "productos" AS p SET
        "codigo" = c.codigo,
        "descripcion" = regexp_replace(p.descripcion, '\\s*Cód\\. [A-Za-z0-9]{1,20}$', ''),
        "descripcion_busqueda" = regexp_replace(p.descripcion_busqueda, '\\s*c[oó]d\\. [a-z0-9]{1,20}\\s*$', '')
      FROM candidatos AS c
      WHERE p.id = c.id AND (c.eliminado_en IS NOT NULL OR c.orden = 1)
    `);

    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "ck_productos_codigo" CHECK (codigo IS NULL OR codigo ~ '^[A-Za-z0-9]{1,20}$')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_productos_marca_codigo" ON "productos" ("id_marca", "codigo") WHERE "eliminado_en" IS NULL AND "codigo" IS NOT NULL`,
    );

    // 3. Ciclo de vida de las importaciones.
    await queryRunner.query(
      `CREATE TYPE "estado_importacion" AS ENUM('VIGENTE', 'ARCHIVADA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" ADD "estado" "estado_importacion" NOT NULL DEFAULT 'VIGENTE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" ADD "archivada_en" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`
      UPDATE "importaciones_producto" AS i
      SET "estado" = 'ARCHIVADA', "archivada_en" = now()
      WHERE i.id <> (
        SELECT x.id FROM "importaciones_producto" AS x
        WHERE x.id_marca = i.id_marca
        ORDER BY x.fecha_creacion DESC, x.id DESC
        LIMIT 1
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" ADD CONSTRAINT "ck_importaciones_producto_archivada" CHECK ((estado = 'ARCHIVADA') = (archivada_en IS NOT NULL))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_importaciones_producto_vigente_marca" ON "importaciones_producto" ("id_marca") WHERE "estado" = 'VIGENTE'`,
    );

    // 4. Bitácora (antes de PAGO_VERIFICADO para que el orden coincida con el catálogo).
    await queryRunner.query(
      `ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS 'IMPORTACION_ELIMINADA' BEFORE 'PAGO_VERIFICADO'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 4. Bitácora: recrea el enumerado sin la acción nueva.
    await queryRunner.query(
      `ALTER TYPE "accion_auditoria" RENAME TO "accion_auditoria_anterior"`,
    );
    await queryRunner.query(
      `CREATE TYPE "accion_auditoria" AS ENUM (${lista(ACCIONES_ANTERIORES)})`,
    );
    await queryRunner.query(
      `ALTER TABLE "auditoria" ALTER COLUMN "accion" TYPE "accion_auditoria" USING "accion"::text::"accion_auditoria"`,
    );
    await queryRunner.query(`DROP TYPE "accion_auditoria_anterior"`);

    // 3. Ciclo de vida de las importaciones.
    await queryRunner.query(
      `DROP INDEX "uq_importaciones_producto_vigente_marca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" DROP CONSTRAINT "ck_importaciones_producto_archivada"`,
    );
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" DROP COLUMN "archivada_en"`,
    );
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" DROP COLUMN "estado"`,
    );
    await queryRunner.query(`DROP TYPE "estado_importacion"`);

    // 2. El código vuelve al final de la descripción, como lo dejaba D-55.
    await queryRunner.query(`
      UPDATE "productos" SET
        "descripcion" = CASE
          WHEN descripcion = '' THEN 'Cód. ' || codigo
          ELSE rtrim(left(descripcion, 2000 - char_length(' Cód. ' || codigo))) || ' Cód. ' || codigo
        END,
        "descripcion_busqueda" = CASE
          WHEN descripcion_busqueda = '' THEN 'cod. ' || lower(codigo)
          ELSE descripcion_busqueda || ' cod. ' || lower(codigo)
        END
      WHERE codigo IS NOT NULL
    `);

    // 1. Código del producto.
    await queryRunner.query(`DROP INDEX "uq_productos_marca_codigo"`);
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "ck_productos_codigo"`,
    );
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "codigo"`);
  }
}
