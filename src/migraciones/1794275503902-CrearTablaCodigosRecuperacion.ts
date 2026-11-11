import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `codigos_recuperacion` (RF-USU-05, D-35, D-39; contrato de
 * recuperación de clave). No modifica ninguna tabla existente.
 *
 * - `hash_codigo`: HMAC-SHA256 en hexadecimal del código de 6 dígitos con
 *   `RECUPERACION_SECRETO`; el código nunca se guarda.
 * - `generado_por`: el Vendedor que lo generó (sin clave foránea, como la
 *   bitácora: el registro se conserva aunque esa cuenta cambie).
 * - `fecha_uso` / `fecha_invalidacion`: un código «pendiente» no tiene
 *   ninguna de las dos. El índice único parcial
 *   `uq_codigos_recuperacion_pendiente` garantiza en la base un solo código
 *   pendiente por Cliente (generar uno nuevo invalida el anterior).
 * - `intentos_fallidos` entre 0 y 5: al quinto, el código queda invalidado.
 */
export class CrearTablaCodigosRecuperacion1794275503902 implements MigrationInterface {
  name = 'CrearTablaCodigosRecuperacion1794275503902';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "codigos_recuperacion" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_usuario" uuid NOT NULL,
        "hash_codigo" character(64) NOT NULL,
        "generado_por" uuid NOT NULL,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_vencimiento" TIMESTAMP WITH TIME ZONE NOT NULL,
        "fecha_uso" TIMESTAMP WITH TIME ZONE,
        "fecha_invalidacion" TIMESTAMP WITH TIME ZONE,
        "intentos_fallidos" integer NOT NULL DEFAULT 0,
        CONSTRAINT "pk_codigos_recuperacion" PRIMARY KEY ("id"),
        CONSTRAINT "ck_codigos_recuperacion_vencimiento" CHECK (fecha_vencimiento > fecha_creacion),
        CONSTRAINT "ck_codigos_recuperacion_intentos" CHECK (intentos_fallidos >= 0 AND intentos_fallidos <= 5),
        CONSTRAINT "fk_codigos_recuperacion_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_codigos_recuperacion_usuario_fecha" ON "codigos_recuperacion" ("id_usuario", "fecha_creacion")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_codigos_recuperacion_pendiente" ON "codigos_recuperacion" ("id_usuario") WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_codigos_recuperacion_pendiente"`);
    await queryRunner.query(
      `DROP INDEX "ix_codigos_recuperacion_usuario_fecha"`,
    );
    await queryRunner.query(`DROP TABLE "codigos_recuperacion"`);
  }
}
