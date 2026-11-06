import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `sesiones` (subfase 1.3: RF-USU-01, D-09, D-19). No modifica
 * ninguna tabla existente.
 *
 * - Cada fila es un token de renovación; solo se guarda su hash SHA-256
 *   (`hash_token`, único), nunca el token.
 * - `familia` agrupa la cadena de rotación: ante la reutilización de un token
 *   ya rotado se revoca toda la familia.
 * - `canal` (`APP` | `PANEL`) se fija al iniciar sesión y la renovación lo conserva.
 * - `fecha_revocacion` y `motivo_revocacion` van siempre juntos
 *   (`ROTADA` | `CERRADA` | `REUTILIZACION`).
 */
export class CrearTablaSesiones1793973656373 implements MigrationInterface {
  name = 'CrearTablaSesiones1793973656373';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "canal_sesion" AS ENUM ('APP', 'PANEL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "motivo_revocacion_sesion" AS ENUM ('ROTADA', 'CERRADA', 'REUTILIZACION')`,
    );
    await queryRunner.query(`
      CREATE TABLE "sesiones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_usuario" uuid NOT NULL,
        "familia" uuid NOT NULL,
        "canal" "canal_sesion" NOT NULL,
        "hash_token" character(64) NOT NULL,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_vencimiento" TIMESTAMP WITH TIME ZONE NOT NULL,
        "fecha_revocacion" TIMESTAMP WITH TIME ZONE,
        "motivo_revocacion" "motivo_revocacion_sesion",
        CONSTRAINT "pk_sesiones" PRIMARY KEY ("id"),
        CONSTRAINT "ck_sesiones_vencimiento" CHECK (fecha_vencimiento > fecha_creacion),
        CONSTRAINT "ck_sesiones_revocacion" CHECK ((fecha_revocacion IS NULL) = (motivo_revocacion IS NULL)),
        CONSTRAINT "fk_sesiones_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_sesiones_hash_token" ON "sesiones" ("hash_token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_sesiones_familia" ON "sesiones" ("familia")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_sesiones_id_usuario" ON "sesiones" ("id_usuario")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_sesiones_id_usuario"`);
    await queryRunner.query(`DROP INDEX "ix_sesiones_familia"`);
    await queryRunner.query(`DROP INDEX "uq_sesiones_hash_token"`);
    await queryRunner.query(`DROP TABLE "sesiones"`);
    await queryRunner.query(`DROP TYPE "motivo_revocacion_sesion"`);
    await queryRunner.query(`DROP TYPE "canal_sesion"`);
  }
}
