import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Miniatura y dimensiones de las imágenes de productos (DEC-05, DEC-06;
 * contrato de productos, «Imagen»). Cambio ADITIVO: tres columnas que admiten
 * NULL, para que las imágenes existentes (anteriores a DEC-06, sin miniatura)
 * sigan siendo válidas. No borra ni modifica datos.
 *
 * - `ruta_miniatura`: `productos/<uuid>-m.jpg`, única cuando existe.
 * - `ancho` y `alto`: dimensiones de la imagen de detalle (lado mayor ≤ 800).
 */
export class AgregarMiniaturaImagenesProducto1795200000001 implements MigrationInterface {
  name = 'AgregarMiniaturaImagenesProducto1795200000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "imagenes_producto"
        ADD COLUMN "ruta_miniatura" character varying(80) NULL,
        ADD COLUMN "ancho" integer NULL,
        ADD COLUMN "alto" integer NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "imagenes_producto" ADD CONSTRAINT "ck_imagenes_producto_ancho" CHECK (ancho IS NULL OR ancho > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "imagenes_producto" ADD CONSTRAINT "ck_imagenes_producto_alto" CHECK (alto IS NULL OR alto > 0)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_imagenes_producto_ruta_miniatura" ON "imagenes_producto" ("ruta_miniatura")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_imagenes_producto_ruta_miniatura"`);
    await queryRunner.query(
      `ALTER TABLE "imagenes_producto" DROP CONSTRAINT "ck_imagenes_producto_alto"`,
    );
    await queryRunner.query(
      `ALTER TABLE "imagenes_producto" DROP CONSTRAINT "ck_imagenes_producto_ancho"`,
    );
    await queryRunner.query(`
      ALTER TABLE "imagenes_producto"
        DROP COLUMN "alto",
        DROP COLUMN "ancho",
        DROP COLUMN "ruta_miniatura"
    `);
  }
}
