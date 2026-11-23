import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dueño del producto y de la importación: `id_vendedor` (contrato
 * cuenta-y-politicas, §4; D-60). Prepara la versión 2 multivendedor **sin
 * cambios visibles** en la versión de vendedor único. **Aditiva**: no borra
 * tablas, columnas ni datos.
 *
 * - `productos.id_vendedor` e `importaciones_producto.id_vendedor` (uuid, FK a
 *   `usuarios`, con índice). Las filas existentes se rellenan con el **único
 *   Vendedor**; si hay filas y no hay Vendedor, la migración falla con un
 *   mensaje claro y no cambia nada. Con las tablas vacías la columna queda
 *   `NOT NULL` igual.
 * - Índices únicos por Vendedor:
 *   - `uq_productos_marca_codigo`: `(id_vendedor, id_marca, codigo)` entre los
 *     productos no eliminados con código.
 *   - `uq_importaciones_producto_vigente_marca`: `(id_vendedor, id_marca)` entre
 *     las `VIGENTE` (una por Vendedor y marca).
 *   - `uq_importaciones_producto_huella`: `(id_vendedor, huella)`: el mismo PDF
 *     de dos Vendedores no choca ni revela la importación de otro.
 *
 * `down()` quita las columnas y vuelve a los índices por marca y huella
 * globales; falla (sin cambiar nada) si en la versión 2 ya hay códigos, marcas
 * vigentes o huellas repetidas entre Vendedores.
 */
export class AgregarIdVendedorProductosEImportaciones1795100000002 implements MigrationInterface {
  name = 'AgregarIdVendedorProductosEImportaciones1795100000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [{ productos, importaciones }] = (await queryRunner.query(`
      SELECT (SELECT count(*)::int FROM "productos") AS productos,
             (SELECT count(*)::int FROM "importaciones_producto") AS importaciones
    `)) as { productos: number; importaciones: number }[];
    const vendedores = (await queryRunner.query(
      `SELECT "id" FROM "usuarios" WHERE "rol" = 'VENDEDOR'`,
    )) as { id: string }[];
    if (productos + importaciones > 0 && vendedores.length !== 1) {
      throw new Error(
        'No se puede asignar el dueño de los productos e importaciones existentes: se esperaba exactamente un Vendedor. Cree el Vendedor con npm run crear-vendedor y vuelva a ejecutar la migración.',
      );
    }

    for (const tabla of ['productos', 'importaciones_producto']) {
      await queryRunner.query(`ALTER TABLE "${tabla}" ADD "id_vendedor" uuid`);
      if (vendedores.length === 1) {
        await queryRunner.query(
          `UPDATE "${tabla}" SET "id_vendedor" = $1`,
          [vendedores[0].id],
        );
      }
      await queryRunner.query(
        `ALTER TABLE "${tabla}" ALTER COLUMN "id_vendedor" SET NOT NULL`,
      );
    }
    await queryRunner.query(
      `CREATE INDEX "ix_productos_id_vendedor" ON "productos" ("id_vendedor")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_importaciones_producto_id_vendedor" ON "importaciones_producto" ("id_vendedor")`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "fk_productos_vendedor" FOREIGN KEY ("id_vendedor") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" ADD CONSTRAINT "fk_importaciones_producto_vendedor" FOREIGN KEY ("id_vendedor") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Índices únicos por Vendedor.
    await queryRunner.query(`DROP INDEX "uq_productos_marca_codigo"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_productos_marca_codigo" ON "productos" ("id_vendedor", "id_marca", "codigo") WHERE "eliminado_en" IS NULL AND "codigo" IS NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_importaciones_producto_vigente_marca"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_importaciones_producto_vigente_marca" ON "importaciones_producto" ("id_vendedor", "id_marca") WHERE "estado" = 'VIGENTE'`,
    );
    await queryRunner.query(`DROP INDEX "uq_importaciones_producto_huella"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_importaciones_producto_huella" ON "importaciones_producto" ("id_vendedor", "huella")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_importaciones_producto_huella"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_importaciones_producto_huella" ON "importaciones_producto" ("huella")`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_importaciones_producto_vigente_marca"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_importaciones_producto_vigente_marca" ON "importaciones_producto" ("id_marca") WHERE "estado" = 'VIGENTE'`,
    );
    await queryRunner.query(`DROP INDEX "uq_productos_marca_codigo"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_productos_marca_codigo" ON "productos" ("id_marca", "codigo") WHERE "eliminado_en" IS NULL AND "codigo" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" DROP CONSTRAINT "fk_importaciones_producto_vendedor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "fk_productos_vendedor"`,
    );
    await queryRunner.query(`DROP INDEX "ix_importaciones_producto_id_vendedor"`);
    await queryRunner.query(`DROP INDEX "ix_productos_id_vendedor"`);
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" DROP COLUMN "id_vendedor"`,
    );
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "id_vendedor"`);
  }
}
