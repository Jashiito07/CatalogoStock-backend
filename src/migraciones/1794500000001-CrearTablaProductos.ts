import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `productos` (RF-PRO-01 a RF-PRO-05, RN-09, PA-07; contrato de
 * productos). No modifica ninguna tabla existente.
 *
 * - `precio numeric(7,2)` con `CHECK (precio > 0)`: dinero exacto, de 0.01 a
 *   99999.99.
 * - `disponibilidad`: enumeración `disponibilidad_producto` (RN-09, D-47).
 * - `nombre_busqueda` y `descripcion_busqueda`: textos sin tildes ni
 *   mayúsculas para buscar (RF-CAT-03) y ordenar por nombre.
 * - `eliminado_en`: eliminación lógica (PA-07); la fila nunca se borra.
 * - Clave foránea a `marcas` sin borrado en cascada: una marca no se elimina.
 */
export class CrearTablaProductos1794500000001 implements MigrationInterface {
  name = 'CrearTablaProductos1794500000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "disponibilidad_producto" AS ENUM('DISPONIBLE', 'AGOTADO', 'PENDIENTE_REPOSICION')`,
    );
    await queryRunner.query(`
      CREATE TABLE "productos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" character varying(120) NOT NULL,
        "nombre_busqueda" character varying(480) NOT NULL,
        "id_marca" uuid NOT NULL,
        "precio" numeric(7,2) NOT NULL,
        "descripcion" character varying(2000) NOT NULL DEFAULT '',
        "descripcion_busqueda" character varying(8000) NOT NULL DEFAULT '',
        "disponibilidad" "disponibilidad_producto" NOT NULL DEFAULT 'DISPONIBLE',
        "eliminado_en" TIMESTAMP WITH TIME ZONE,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_productos" PRIMARY KEY ("id"),
        CONSTRAINT "ck_productos_precio" CHECK (precio > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_productos_id_marca" ON "productos" ("id_marca")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_productos_nombre_busqueda" ON "productos" ("nombre_busqueda")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_productos_eliminado_en" ON "productos" ("eliminado_en")`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "fk_productos_marca" FOREIGN KEY ("id_marca") REFERENCES "marcas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "fk_productos_marca"`,
    );
    await queryRunner.query(`DROP INDEX "ix_productos_eliminado_en"`);
    await queryRunner.query(`DROP INDEX "ix_productos_nombre_busqueda"`);
    await queryRunner.query(`DROP INDEX "ix_productos_id_marca"`);
    await queryRunner.query(`DROP TABLE "productos"`);
    await queryRunner.query(`DROP TYPE "disponibilidad_producto"`);
  }
}
