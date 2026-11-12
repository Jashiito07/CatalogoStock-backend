import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `marcas` (RF-PRO-04, RF-PRO-06, D-43; contrato de productos).
 * No modifica ninguna tabla existente.
 *
 * - `nombre_busqueda`: el nombre sin tildes, en minúsculas y con espacios
 *   simples. Su índice único (`uq_marcas_nombre_busqueda`) impide dos marcas
 *   con el mismo nombre aunque difieran en mayúsculas o tildes.
 * - `color` y `color_acento`: `#RRGGBB` en mayúsculas, también verificado en
 *   la base.
 * - No hay borrado: una marca se desactiva (`activa`).
 */
export class CrearTablaMarcas1794400000001 implements MigrationInterface {
  name = 'CrearTablaMarcas1794400000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "marcas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" character varying(40) NOT NULL,
        "nombre_busqueda" character varying(160) NOT NULL,
        "color" character(7) NOT NULL,
        "color_acento" character(7),
        "activa" boolean NOT NULL DEFAULT true,
        "orden" integer NOT NULL DEFAULT 0,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_marcas" PRIMARY KEY ("id"),
        CONSTRAINT "ck_marcas_color" CHECK (color ~ '^#[0-9A-F]{6}$'),
        CONSTRAINT "ck_marcas_color_acento" CHECK (color_acento IS NULL OR color_acento ~ '^#[0-9A-F]{6}$'),
        CONSTRAINT "ck_marcas_orden" CHECK (orden >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_marcas_nombre_busqueda" ON "marcas" ("nombre_busqueda")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_marcas_nombre_busqueda"`);
    await queryRunner.query(`DROP TABLE "marcas"`);
  }
}
