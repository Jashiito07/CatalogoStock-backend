import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `imagenes_producto` (RF-PRO-01, D-46; contrato de productos,
 * «Endpoints: imágenes»). No modifica ninguna tabla existente.
 *
 * - `orden >= 0`: posición; la principal es la de `orden = 0` (no se guarda aparte).
 * - `ruta_relativa` única: `productos/<uuid>.<ext>`, relativa a `RUTA_ALMACENAMIENTO`.
 * - `tipo` en (`jpg`, `png`, `webp`) y `tamanio_bytes` de 1 a 2 097 152 (2 MB).
 * - Clave foránea a `productos` sin borrado en cascada: los productos solo se
 *   eliminan de forma lógica (PA-07) y conservan sus imágenes.
 */
export class CrearTablaImagenesProducto1794600000001 implements MigrationInterface {
  name = 'CrearTablaImagenesProducto1794600000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "imagenes_producto" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_producto" uuid NOT NULL,
        "orden" integer NOT NULL,
        "ruta_relativa" character varying(80) NOT NULL,
        "tipo" character varying(10) NOT NULL,
        "tamanio_bytes" integer NOT NULL,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_imagenes_producto" PRIMARY KEY ("id"),
        CONSTRAINT "ck_imagenes_producto_orden" CHECK (orden >= 0),
        CONSTRAINT "ck_imagenes_producto_tipo" CHECK (tipo IN ('jpg', 'png', 'webp')),
        CONSTRAINT "ck_imagenes_producto_tamanio" CHECK (tamanio_bytes > 0 AND tamanio_bytes <= 2097152)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_imagenes_producto_producto_orden" ON "imagenes_producto" ("id_producto", "orden")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_imagenes_producto_ruta" ON "imagenes_producto" ("ruta_relativa")`,
    );
    await queryRunner.query(
      `ALTER TABLE "imagenes_producto" ADD CONSTRAINT "fk_imagenes_producto_producto" FOREIGN KEY ("id_producto") REFERENCES "productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "imagenes_producto" DROP CONSTRAINT "fk_imagenes_producto_producto"`,
    );
    await queryRunner.query(`DROP INDEX "uq_imagenes_producto_ruta"`);
    await queryRunner.query(`DROP INDEX "ix_imagenes_producto_producto_orden"`);
    await queryRunner.query(`DROP TABLE "imagenes_producto"`);
  }
}
