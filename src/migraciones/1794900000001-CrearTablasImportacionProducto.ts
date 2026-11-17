import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas de la importación asistida del catálogo en PDF (RF-PRO-01,
 * D-49; contrato `productos-importacion`). No modifica ninguna tabla existente.
 *
 * - `importaciones_producto`: una fila por PDF procesado. El PDF **no** se
 *   guarda; solo su huella SHA-256 (`huella`, única: idempotencia).
 * - `borradores_producto`: propuestas de producto. Un borrador **no es un
 *   producto**: nunca aparece en `productos` hasta que se aprueba.
 * - `precio` y `precio_normal` son `numeric(7,2)` (dinero exacto) y mayores
 *   que cero; pueden ser nulos (el lector no los encontró).
 * - Enumerados `estado_borrador` y `disponibilidad_borrador`.
 * - `APROBADO` si y solo si hay `id_producto`.
 * - Claves foráneas sin borrado en cascada (a `marcas`, `productos` y entre
 *   las dos tablas nuevas).
 */
export class CrearTablasImportacionProducto1794900000001 implements MigrationInterface {
  name = 'CrearTablasImportacionProducto1794900000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "estado_borrador" AS ENUM('PENDIENTE', 'APROBADO', 'DESCARTADO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "disponibilidad_borrador" AS ENUM('DISPONIBLE', 'AGOTADO', 'PENDIENTE_REPOSICION')`,
    );
    await queryRunner.query(`
      CREATE TABLE "importaciones_producto" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre_archivo" character varying(120) NOT NULL,
        "huella" character varying(64) NOT NULL,
        "id_marca" uuid NOT NULL,
        "paginas" integer NOT NULL,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_importaciones_producto" PRIMARY KEY ("id"),
        CONSTRAINT "ck_importaciones_producto_huella" CHECK (huella ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "ck_importaciones_producto_paginas" CHECK (paginas > 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_importaciones_producto_huella" ON "importaciones_producto" ("huella")`,
    );
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" ADD CONSTRAINT "fk_importaciones_producto_marca" FOREIGN KEY ("id_marca") REFERENCES "marcas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`
      CREATE TABLE "borradores_producto" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_importacion" uuid NOT NULL,
        "pagina" integer NOT NULL,
        "posicion" integer NOT NULL,
        "codigo" character varying(20),
        "nombre" character varying(120) NOT NULL,
        "nombre_busqueda" character varying(480) NOT NULL,
        "descripcion" character varying(2000),
        "precio" numeric(7,2),
        "precio_normal" numeric(7,2),
        "id_marca" uuid NOT NULL,
        "disponibilidad" "disponibilidad_borrador" NOT NULL DEFAULT 'DISPONIBLE',
        "estado" "estado_borrador" NOT NULL DEFAULT 'PENDIENTE',
        "advertencias" character varying(20) array NOT NULL DEFAULT '{}',
        "id_producto" uuid,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_borradores_producto" PRIMARY KEY ("id"),
        CONSTRAINT "ck_borradores_producto_pagina" CHECK (pagina >= 1),
        CONSTRAINT "ck_borradores_producto_codigo" CHECK (codigo IS NULL OR codigo ~ '^[A-Za-z0-9]{1,20}$'),
        CONSTRAINT "ck_borradores_producto_precio" CHECK (precio IS NULL OR precio > 0),
        CONSTRAINT "ck_borradores_producto_precio_normal" CHECK (precio_normal IS NULL OR precio_normal > 0),
        CONSTRAINT "ck_borradores_producto_aprobado" CHECK ((estado = 'APROBADO') = (id_producto IS NOT NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_borradores_producto_revision" ON "borradores_producto" ("id_importacion", "estado", "pagina", "posicion")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_borradores_producto_codigo_estado" ON "borradores_producto" ("codigo", "estado")`,
    );
    await queryRunner.query(
      `ALTER TABLE "borradores_producto" ADD CONSTRAINT "fk_borradores_producto_importacion" FOREIGN KEY ("id_importacion") REFERENCES "importaciones_producto"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "borradores_producto" ADD CONSTRAINT "fk_borradores_producto_marca" FOREIGN KEY ("id_marca") REFERENCES "marcas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "borradores_producto" ADD CONSTRAINT "fk_borradores_producto_producto" FOREIGN KEY ("id_producto") REFERENCES "productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "borradores_producto" DROP CONSTRAINT "fk_borradores_producto_producto"`,
    );
    await queryRunner.query(
      `ALTER TABLE "borradores_producto" DROP CONSTRAINT "fk_borradores_producto_marca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "borradores_producto" DROP CONSTRAINT "fk_borradores_producto_importacion"`,
    );
    await queryRunner.query(`DROP INDEX "ix_borradores_producto_codigo_estado"`);
    await queryRunner.query(`DROP INDEX "ix_borradores_producto_revision"`);
    await queryRunner.query(`DROP TABLE "borradores_producto"`);
    await queryRunner.query(
      `ALTER TABLE "importaciones_producto" DROP CONSTRAINT "fk_importaciones_producto_marca"`,
    );
    await queryRunner.query(`DROP INDEX "uq_importaciones_producto_huella"`);
    await queryRunner.query(`DROP TABLE "importaciones_producto"`);
    await queryRunner.query(`DROP TYPE "disponibilidad_borrador"`);
    await queryRunner.query(`DROP TYPE "estado_borrador"`);
  }
}
