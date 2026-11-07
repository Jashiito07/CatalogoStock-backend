import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `auditoria`, la bitácora de actividades (subfase 1.5:
 * RF-USU-04, D-18, D-20; contrato de auditoría). No modifica ninguna tabla
 * existente.
 *
 * - `accion` y `entidad` usan el catálogo cerrado del contrato. Las fases
 *   siguientes agregan valores con `ALTER TYPE … ADD VALUE` (no destructivo).
 * - `id_usuario` no tiene clave foránea a `usuarios`: la bitácora es de otro
 *   módulo y conserva el registro aunque el usuario se elimine en el futuro.
 * - `detalle` es un objeto JSON sin datos sensibles (salvaguarda del dominio).
 * - Índices para los filtros de `GET /auditoria`, con `fecha` para ordenar.
 */
export class CrearTablaAuditoria1794036117362 implements MigrationInterface {
  name = 'CrearTablaAuditoria1794036117362';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "accion_auditoria" AS ENUM (
        'USUARIO_REGISTRADO',
        'VENDEDOR_CREADO',
        'SESION_INICIADA',
        'SESION_FALLIDA',
        'SESION_CERRADA',
        'SESION_REUTILIZACION_DETECTADA',
        'ACCESO_DENEGADO',
        'PAGO_VERIFICADO',
        'PEDIDO_ESTADO_CAMBIADO'
      )
    `);
    await queryRunner.query(
      `CREATE TYPE "entidad_auditoria" AS ENUM ('USUARIO', 'SESION', 'PEDIDO', 'PAGO')`,
    );
    await queryRunner.query(`
      CREATE TABLE "auditoria" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "accion" "accion_auditoria" NOT NULL,
        "id_usuario" uuid,
        "entidad" "entidad_auditoria",
        "id_entidad" uuid,
        "detalle" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "pk_auditoria" PRIMARY KEY ("id"),
        CONSTRAINT "ck_auditoria_id_entidad" CHECK (id_entidad IS NULL OR entidad IS NOT NULL),
        CONSTRAINT "ck_auditoria_detalle_objeto" CHECK (jsonb_typeof(detalle) = 'object')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_auditoria_fecha" ON "auditoria" ("fecha")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_auditoria_accion_fecha" ON "auditoria" ("accion", "fecha")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_auditoria_id_usuario_fecha" ON "auditoria" ("id_usuario", "fecha")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_auditoria_entidad_fecha" ON "auditoria" ("entidad", "id_entidad", "fecha")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_auditoria_entidad_fecha"`);
    await queryRunner.query(`DROP INDEX "ix_auditoria_id_usuario_fecha"`);
    await queryRunner.query(`DROP INDEX "ix_auditoria_accion_fecha"`);
    await queryRunner.query(`DROP INDEX "ix_auditoria_fecha"`);
    await queryRunner.query(`DROP TABLE "auditoria"`);
    await queryRunner.query(`DROP TYPE "entidad_auditoria"`);
    await queryRunner.query(`DROP TYPE "accion_auditoria"`);
  }
}
