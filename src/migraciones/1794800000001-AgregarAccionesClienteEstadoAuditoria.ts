import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Acciones nuevas de la bitácora (contrato usuarios-gestion, D-53). */
const ACCIONES_NUEVAS = ['CLIENTE_DESACTIVADO', 'CLIENTE_REACTIVADO'] as const;

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
  'CORREO_VERIFICADO',
  'CODIGO_CORREO_ENVIADO',
  'SOLICITUD_RECUPERACION_IGNORADA',
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
 * Desactivar y reactivar clientes (contrato usuarios-gestion, D-53).
 *
 * `up()` es aditiva: dos valores nuevos en `accion_auditoria`, antes de
 * `MARCA_CREADA` para que el orden coincida con `ACCIONES_AUDITORIA`. No
 * toca datos. (Los motivos de `SESION_FALLIDA` viven en el `detalle` jsonb,
 * no en un enumerado de PostgreSQL: no hace falta migrarlos.)
 *
 * `down()` recrea el tipo sin esos valores. Nunca borra la bitácora: si ya hay
 * filas con una acción nueva, la conversión falla y toda la reversión se
 * deshace.
 */
export class AgregarAccionesClienteEstadoAuditoria1794800000001 implements MigrationInterface {
  name = 'AgregarAccionesClienteEstadoAuditoria1794800000001';

  async up(queryRunner: QueryRunner): Promise<void> {
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
  }
}
