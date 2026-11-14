import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Acciones de la bitácora de la Fase 2: marcas, productos e imágenes
 * (contrato de auditoría y de productos). Se agregan todas ahora para no
 * migrar la enumeración otra vez en las subfases 2.3 y 2.4.
 */
const ACCIONES_NUEVAS = [
  'MARCA_CREADA',
  'MARCA_ACTUALIZADA',
  'PRODUCTO_CREADO',
  'PRODUCTO_ACTUALIZADO',
  'PRODUCTO_ELIMINADO',
  'IMAGEN_AGREGADA',
  'IMAGEN_ELIMINADA',
] as const;

const ENTIDADES_NUEVAS = ['MARCA', 'PRODUCTO'] as const;

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
  'PAGO_VERIFICADO',
  'PEDIDO_ESTADO_CAMBIADO',
] as const;

const ENTIDADES_ANTERIORES = ['USUARIO', 'SESION', 'PEDIDO', 'PAGO'] as const;

function lista(valores: readonly string[]): string {
  return valores.map((valor) => `'${valor}'`).join(', ');
}

/**
 * Agrega a `accion_auditoria` y `entidad_auditoria` los valores de la Fase 2.
 * No destructiva: `ALTER TYPE … ADD VALUE` no toca las filas.
 *
 * Se insertan antes de `PAGO_VERIFICADO` y de `PEDIDO` para que el orden de
 * los tipos coincida con `ACCIONES_AUDITORIA` y `ENTIDADES_AUDITORIA` (y
 * `migracion:generar` no vea diferencias).
 *
 * `down()` vuelve a crear los tipos sin esos valores. Si la bitácora ya tiene
 * registros con alguno de los valores nuevos, la conversión falla y la
 * reversión se deshace completa: nunca borra registros de la bitácora.
 */
export class AgregarAccionesCatalogoAuditoria1794400000002 implements MigrationInterface {
  name = 'AgregarAccionesCatalogoAuditoria1794400000002';

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
