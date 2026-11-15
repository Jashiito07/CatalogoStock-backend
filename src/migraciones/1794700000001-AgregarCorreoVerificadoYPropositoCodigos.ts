import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Acciones nuevas de la bitácora (contrato de correo, D-50). */
const ACCIONES_NUEVAS = [
  'CORREO_VERIFICADO',
  'CODIGO_CORREO_ENVIADO',
  'SOLICITUD_RECUPERACION_IGNORADA',
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
  'CODIGO_RECUPERACION_GENERADO',
  'CLAVE_RESTABLECIDA',
  'RECUPERACION_FALLIDA',
  'CLAVE_CAMBIADA',
  'MARCA_CREADA',
  'MARCA_ACTUALIZADA',
  'PRODUCTO_CREADO',
  'PRODUCTO_ACTUALIZADO',
  'PRODUCTO_ELIMINADO',
  'IMAGEN_AGREGADA',
  'IMAGEN_ELIMINADA',
  'PAGO_VERIFICADO',
  'PEDIDO_ESTADO_CAMBIADO',
] as const;

/**
 * Verificación del correo y recuperación de clave por correo (contrato de
 * correo, RF-USU-05, D-50).
 *
 * `up()` es aditiva y no toca datos existentes:
 * - `usuarios.correo_verificado_en`: nula; las cuentas existentes quedan sin verificar.
 * - `codigos_recuperacion.proposito` (tipo `proposito_codigo`): los códigos
 *   existentes quedan como `RECUPERACION_ASISTIDA` (valor por defecto).
 * - `codigos_recuperacion.generado_por` pasa a admitir nulos (lo genera el
 *   sistema cuando el código se envía por correo); un código asistido sigue
 *   exigiéndolo (`ck_codigos_recuperacion_generado_por`).
 * - El índice único de códigos pendientes pasa a ser por usuario **y
 *   propósito**: la verificación del correo y la recuperación no se pisan.
 * - Tres acciones nuevas en `accion_auditoria` (antes de `MARCA_CREADA`, para
 *   que el orden coincida con `ACCIONES_AUDITORIA`).
 *
 * `down()` revierte el esquema. Para volver a exigir `generado_por` y un solo
 * código pendiente por usuario borra los códigos que no son de recuperación
 * asistida: son temporales (vencen a los 15 minutos) y su hash no sirve sin
 * esta función. Nunca toca la bitácora: si ya tiene alguna acción nueva, la
 * conversión del tipo falla y toda la reversión se deshace.
 */
export class AgregarCorreoVerificadoYPropositoCodigos1794700000001 implements MigrationInterface {
  name = 'AgregarCorreoVerificadoYPropositoCodigos1794700000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD "correo_verificado_en" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE TYPE "proposito_codigo" AS ENUM ('RECUPERACION_ASISTIDA', 'RECUPERACION_CORREO', 'VERIFICACION_CORREO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ADD "proposito" "proposito_codigo" NOT NULL DEFAULT 'RECUPERACION_ASISTIDA'`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ALTER COLUMN "generado_por" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ADD CONSTRAINT "ck_codigos_recuperacion_generado_por" CHECK (proposito <> 'RECUPERACION_ASISTIDA' OR generado_por IS NOT NULL)`,
    );
    await queryRunner.query(`DROP INDEX "uq_codigos_recuperacion_pendiente"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_codigos_recuperacion_pendiente" ON "codigos_recuperacion" ("id_usuario", "proposito") WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL`,
    );
    for (const accion of ACCIONES_NUEVAS) {
      await queryRunner.query(
        `ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS '${accion}' BEFORE 'MARCA_CREADA'`,
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

    await queryRunner.query(
      `DELETE FROM "codigos_recuperacion" WHERE "proposito" <> 'RECUPERACION_ASISTIDA'`,
    );
    await queryRunner.query(`DROP INDEX "uq_codigos_recuperacion_pendiente"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_codigos_recuperacion_pendiente" ON "codigos_recuperacion" ("id_usuario") WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" DROP CONSTRAINT "ck_codigos_recuperacion_generado_por"`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ALTER COLUMN "generado_por" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" DROP COLUMN "proposito"`,
    );
    await queryRunner.query(`DROP TYPE "proposito_codigo"`);
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP COLUMN "correo_verificado_en"`,
    );
  }
}
