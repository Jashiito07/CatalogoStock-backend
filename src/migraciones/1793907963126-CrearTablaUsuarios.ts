import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `usuarios` (subfase 1.2: RF-USU-02, RNF-02, D-07, D-14).
 *
 * - `correo` único (índice `uq_usuarios_correo`) y siempre en minúsculas.
 * - Un solo Vendedor: índice único parcial `uq_usuarios_un_vendedor` (D-21, PA-09).
 * - `telefono` solo celular de Ecuador en E.164 (`+5939XXXXXXXX`, D-14).
 * - `hash_clave` guarda el hash bcrypt, nunca la clave (RNF-02).
 * - `rol` con la enumeración `rol_usuario` (CLIENTE | VENDEDOR).
 * - La aceptación del aviso de privacidad es obligatoria para el Cliente y
 *   puede ser nula solo para el Vendedor semilla (contrato de usuarios).
 */
export class CrearTablaUsuarios1793907963126 implements MigrationInterface {
  name = 'CrearTablaUsuarios1793907963126';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "rol_usuario" AS ENUM ('CLIENTE', 'VENDEDOR')`,
    );
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" character varying(100) NOT NULL,
        "correo" character varying(254) NOT NULL,
        "telefono" character varying(13) NOT NULL,
        "hash_clave" character varying(100) NOT NULL,
        "rol" "rol_usuario" NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "fecha_aceptacion_privacidad" TIMESTAMP WITH TIME ZONE,
        "version_privacidad" character varying(50),
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_usuarios" PRIMARY KEY ("id"),
        CONSTRAINT "ck_usuarios_correo_minusculas" CHECK (correo = lower(correo)),
        CONSTRAINT "ck_usuarios_telefono_celular_ecuador" CHECK (telefono ~ '^\\+5939[0-9]{8}$'),
        CONSTRAINT "ck_usuarios_privacidad_cliente" CHECK (rol = 'VENDEDOR' OR (fecha_aceptacion_privacidad IS NOT NULL AND version_privacidad IS NOT NULL))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_usuarios_correo" ON "usuarios" ("correo")`,
    );
    // D-21 / PA-09: la base impide un segundo Vendedor.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_usuarios_un_vendedor" ON "usuarios" ("rol") WHERE rol = 'VENDEDOR'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_usuarios_un_vendedor"`);
    await queryRunner.query(`DROP INDEX "uq_usuarios_correo"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TYPE "rol_usuario"`);
  }
}
