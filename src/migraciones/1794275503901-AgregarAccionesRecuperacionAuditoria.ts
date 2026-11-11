import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Acciones nuevas de RF-USU-05 (contrato de auditoría, D-35, D-39). */
const ACCIONES_NUEVAS = [
  'CODIGO_RECUPERACION_GENERADO',
  'CLAVE_RESTABLECIDA',
  'RECUPERACION_FALLIDA',
  'CLAVE_CAMBIADA',
] as const;

/** Catálogo anterior, para `down()`. */
const ACCIONES_ANTERIORES = [
  'USUARIO_REGISTRADO',
  'VENDEDOR_CREADO',
  'SESION_INICIADA',
  'SESION_FALLIDA',
  'SESION_CERRADA',
  'SESION_REUTILIZACION_DETECTADA',
  'ACCESO_DENEGADO',
  'PAGO_VERIFICADO',
  'PEDIDO_ESTADO_CAMBIADO',
] as const;

/**
 * Agrega a `accion_auditoria` las acciones de recuperación y cambio de clave
 * (RF-USU-05). No destructiva: `ALTER TYPE … ADD VALUE` no toca las filas.
 *
 * Se insertan antes de `PAGO_VERIFICADO` para que el orden del tipo coincida
 * con el de `ACCIONES_AUDITORIA` (y `migracion:generar` no vea diferencias).
 *
 * `down()` vuelve a crear el tipo sin esos valores. Si la bitácora ya tiene
 * registros con alguna de las acciones nuevas, la conversión falla y la
 * reversión se deshace completa: nunca borra registros de la bitácora.
 */
export class AgregarAccionesRecuperacionAuditoria1794275503901 implements MigrationInterface {
  name = 'AgregarAccionesRecuperacionAuditoria1794275503901';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const accion of ACCIONES_NUEVAS) {
      await queryRunner.query(
        `ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS '${accion}' BEFORE 'PAGO_VERIFICADO'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const valores = ACCIONES_ANTERIORES.map((accion) => `'${accion}'`).join(
      ', ',
    );
    await queryRunner.query(
      `ALTER TYPE "accion_auditoria" RENAME TO "accion_auditoria_anterior"`,
    );
    await queryRunner.query(
      `CREATE TYPE "accion_auditoria" AS ENUM (${valores})`,
    );
    await queryRunner.query(
      `ALTER TABLE "auditoria" ALTER COLUMN "accion" TYPE "accion_auditoria" USING "accion"::text::"accion_auditoria"`,
    );
    await queryRunner.query(`DROP TYPE "accion_auditoria_anterior"`);
  }
}
