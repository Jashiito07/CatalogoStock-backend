import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Acciones nuevas de la bitácora (contrato productos-importacion, D-49). */
const ACCIONES_NUEVAS = [
  'IMPORTACION_CREADA',
  'BORRADORES_APROBADOS',
  'BORRADORES_DESCARTADOS',
] as const;

const ENTIDADES_NUEVAS = ['IMPORTACION'] as const;

/** Catálogos anteriores, para `down()`. */
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
  'CLIENTE_DESACTIVADO',
  'CLIENTE_REACTIVADO',
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

const ENTIDADES_ANTERIORES = [
  'USUARIO',
  'SESION',
  'MARCA',
  'PRODUCTO',
  'PEDIDO',
  'PAGO',
] as const;

function lista(valores: readonly string[]): string {
  return valores.map((valor) => `'${valor}'`).join(', ');
}

/**
 * Importación del catálogo en PDF (contrato productos-importacion, D-49): tres
 * acciones nuevas en `accion_auditoria` y la entidad `IMPORTACION` en
 * `entidad_auditoria`.
 *
 * `up()` es aditiva (`ALTER TYPE . ADD VALUE`): no toca datos. Los valores se
 * insertan antes de `PAGO_VERIFICADO` y de `PEDIDO` para que el orden de los
 * tipos coincida con `ACCIONES_AUDITORIA` y `ENTIDADES_AUDITORIA` (y
 * `migracion:generar` no vea diferencias).
 *
 * `down()` recrea los tipos sin esos valores. Nunca borra la bitácora: si ya
 * hay filas con una acción o entidad nueva, la conversión falla y toda la
 * reversión se deshace.
 */
export class AgregarAccionesImportacionAuditoria1794900000002 implements MigrationInterface {
  name = 'AgregarAccionesImportacionAuditoria1794900000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const accion of ACCIONES_NUEVAS) {
      await queryRunner.query(
        `ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS '${accion}' BEFORE 'PAGO_VERIFICADO'`,
      );
    }
    for (const entidad of ENTIDADES_NUEVAS) {
      await queryRunner.query(
        `ALTER TYPE "entidad_auditoria" ADD VALUE IF NOT EXISTS '${entidad}' BEFORE 'PEDIDO'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.recrearTipo(
      queryRunner,
      'accion_auditoria',
      'accion',
      ACCIONES_ANTERIORES,
    );
    await this.recrearTipo(
      queryRunner,
      'entidad_auditoria',
      'entidad',
      ENTIDADES_ANTERIORES,
    );
  }

  private async recrearTipo(
    queryRunner: QueryRunner,
    tipo: string,
    columna: string,
    valores: readonly string[],
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "${tipo}" RENAME TO "${tipo}_anterior"`,
    );
    await queryRunner.query(
      `CREATE TYPE "${tipo}" AS ENUM (${lista(valores)})`,
    );
    await queryRunner.query(
      `ALTER TABLE "auditoria" ALTER COLUMN "${columna}" TYPE "${tipo}" USING "${columna}"::text::"${tipo}"`,
    );
    await queryRunner.query(`DROP TYPE "${tipo}_anterior"`);
  }
}
