import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Acciones nuevas de la bitácora (contrato cuenta-y-politicas, RF-USU-06 y RF-USU-08). */
const ACCIONES_NUEVAS = [
  'CUENTA_ELIMINADA',
  'PERFIL_VENDEDOR_ACTUALIZADO',
] as const;

/** Catálogo anterior de la bitácora, para `down()`. */
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
  'IMPORTACION_CREADA',
  'BORRADORES_APROBADOS',
  'BORRADORES_DESCARTADOS',
  'IMPORTACION_ELIMINADA',
  'PAGO_VERIFICADO',
  'PEDIDO_ESTADO_CAMBIADO',
] as const;

const PROPOSITOS_ANTERIORES = [
  'RECUPERACION_ASISTIDA',
  'RECUPERACION_CORREO',
  'VERIFICACION_CORREO',
] as const;

function lista(valores: readonly string[]): string {
  return valores.map((valor) => `'${valor}'`).join(', ');
}

/**
 * Eliminar la cuenta y perfil comercial del Vendedor (contrato
 * cuenta-y-politicas; RF-USU-06, RF-USU-08, PA-21). **Aditiva**: no borra
 * tablas, columnas ni datos.
 *
 * 1. `usuarios.eliminado_en` (nulo): cuándo se anonimizó la cuenta. El
 *    `CHECK` del teléfono admite el valor anonimizado `+000` + 9 dígitos
 *    **solo** si `eliminado_en` tiene fecha, y otro `CHECK` exige que una
 *    cuenta eliminada esté inactiva.
 * 2. `proposito_codigo` gana `ELIMINACION_CUENTA` (código por correo para
 *    eliminar la cuenta desde la web).
 * 3. Tabla `perfiles_vendedor` (una fila por Vendedor).
 * 4. Dos acciones nuevas de la bitácora (antes de `PAGO_VERIFICADO`, para que el
 *    orden coincida con `ACCIONES_AUDITORIA`).
 *
 * `down()` revierte el esquema. **Nunca** deshace una eliminación: si hay
 * cuentas eliminadas, falla con un mensaje claro (sus datos ya no existen) y
 * nada cambia; tampoco borra la bitácora (si ya tiene las acciones nuevas, la
 * conversión del tipo falla y la reversión se deshace). Sí borra los códigos de
 * eliminación pendientes: son temporales (15 minutos).
 */
export class AgregarEliminacionCuentaYPerfilVendedor1795100000001 implements MigrationInterface {
  name = 'AgregarEliminacionCuentaYPerfilVendedor1795100000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Cuenta eliminada.
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD "eliminado_en" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "ck_usuarios_telefono_celular_ecuador"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "ck_usuarios_telefono_celular_ecuador" CHECK (telefono ~ '^\\+5939[0-9]{8}$' OR (eliminado_en IS NOT NULL AND telefono ~ '^\\+000[0-9]{9}$'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "ck_usuarios_eliminado_inactivo" CHECK (eliminado_en IS NULL OR activo = false)`,
    );

    // 2. Propósito del código.
    await queryRunner.query(
      `ALTER TYPE "proposito_codigo" ADD VALUE IF NOT EXISTS 'ELIMINACION_CUENTA'`,
    );

    // 3. Perfil comercial del Vendedor.
    await queryRunner.query(`
      CREATE TABLE "perfiles_vendedor" (
        "id_usuario" uuid NOT NULL,
        "nombre_comercial" character varying(80) NOT NULL,
        "ciudad" character varying(60) NOT NULL,
        "provincia" character varying(40) NOT NULL,
        "whatsapp" character varying(13) NOT NULL,
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "ck_perfiles_vendedor_whatsapp" CHECK (whatsapp ~ '^\\+5939[0-9]{8}$'),
        CONSTRAINT "pk_perfiles_vendedor" PRIMARY KEY ("id_usuario")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "perfiles_vendedor" ADD CONSTRAINT "fk_perfiles_vendedor_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // 4. Bitácora.
    for (const accion of ACCIONES_NUEVAS) {
      await queryRunner.query(
        `ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS '${accion}' BEFORE 'PAGO_VERIFICADO'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Una cuenta anonimizada no se puede «des-anonimizar»: se aborta antes de tocar nada.
    const [{ total }] = (await queryRunner.query(
      `SELECT count(*)::int AS total FROM "usuarios" WHERE "eliminado_en" IS NOT NULL`,
    )) as { total: number }[];
    if (total > 0) {
      throw new Error(
        'No se puede revertir: hay cuentas eliminadas (anonimizadas) y sus datos originales ya no existen.',
      );
    }

    // 4. Bitácora: recrea el enumerado sin las acciones nuevas.
    await queryRunner.query(
      `ALTER TYPE "accion_auditoria" RENAME TO "accion_auditoria_anterior"`,
    );
    await queryRunner.query(
      `CREATE TYPE "accion_auditoria" AS ENUM (${lista(ACCIONES_ANTERIORES)})`,
    );
    await queryRunner.query(
      `ALTER TABLE "auditoria" ALTER COLUMN "accion" TYPE "accion_auditoria" USING "accion"::text::"accion_auditoria"`,
    );
    await queryRunner.query(`DROP TYPE "accion_auditoria_anterior"`);

    // 3. Perfil comercial.
    await queryRunner.query(
      `ALTER TABLE "perfiles_vendedor" DROP CONSTRAINT "fk_perfiles_vendedor_usuario"`,
    );
    await queryRunner.query(`DROP TABLE "perfiles_vendedor"`);

    // 2. Propósito: los códigos de eliminación pendientes son temporales y se borran.
    await queryRunner.query(
      `DELETE FROM "codigos_recuperacion" WHERE "proposito" = 'ELIMINACION_CUENTA'`,
    );
    await queryRunner.query(`DROP INDEX "uq_codigos_recuperacion_pendiente"`);
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" DROP CONSTRAINT "ck_codigos_recuperacion_generado_por"`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ALTER COLUMN "proposito" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "proposito_codigo" RENAME TO "proposito_codigo_anterior"`,
    );
    await queryRunner.query(
      `CREATE TYPE "proposito_codigo" AS ENUM (${lista(PROPOSITOS_ANTERIORES)})`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ALTER COLUMN "proposito" TYPE "proposito_codigo" USING "proposito"::text::"proposito_codigo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ALTER COLUMN "proposito" SET DEFAULT 'RECUPERACION_ASISTIDA'`,
    );
    await queryRunner.query(`DROP TYPE "proposito_codigo_anterior"`);
    await queryRunner.query(
      `ALTER TABLE "codigos_recuperacion" ADD CONSTRAINT "ck_codigos_recuperacion_generado_por" CHECK (proposito <> 'RECUPERACION_ASISTIDA' OR generado_por IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_codigos_recuperacion_pendiente" ON "codigos_recuperacion" ("id_usuario", "proposito") WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL`,
    );

    // 1. Cuenta eliminada.
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "ck_usuarios_eliminado_inactivo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "ck_usuarios_telefono_celular_ecuador"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "ck_usuarios_telefono_celular_ecuador" CHECK (telefono ~ '^\\+5939[0-9]{8}$')`,
    );
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "eliminado_en"`);
  }
}
