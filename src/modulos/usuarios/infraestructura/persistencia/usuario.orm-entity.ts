import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ROLES, type Rol } from '../../dominio/rol.js';

/**
 * Tabla `usuarios` (RF-USU-02, RNF-02). Migración: CrearTablaUsuarios.
 *
 * Las restricciones repiten en la base las reglas del dominio para que ningún
 * camino (ni un error de programación) guarde datos fuera de las reglas.
 */
@Entity('usuarios')
@Index('uq_usuarios_correo', ['correo'], { unique: true })
// D-21 / PA-09: un solo Vendedor, también en la base.
@Index('uq_usuarios_un_vendedor', ['rol'], {
  unique: true,
  where: `rol = 'VENDEDOR'`,
})
@Check('ck_usuarios_correo_minusculas', 'correo = lower(correo)')
// RF-USU-06: una cuenta eliminada queda con un teléfono anonimizado (`+000` y
// 9 dígitos, no es un celular válido) y siempre inactiva.
@Check(
  'ck_usuarios_telefono_celular_ecuador',
  `telefono ~ '^\\+5939[0-9]{8}$' OR (eliminado_en IS NOT NULL AND telefono ~ '^\\+000[0-9]{9}$')`,
)
@Check('ck_usuarios_eliminado_inactivo', 'eliminado_en IS NULL OR activo = false')
@Check(
  'ck_usuarios_privacidad_cliente',
  `rol = 'VENDEDOR' OR (fecha_aceptacion_privacidad IS NOT NULL AND version_privacidad IS NOT NULL)`,
)
export class UsuarioOrmEntity {
  /**
   * El id lo genera la aplicación (GeneradorId) y se inserta tal cual; la
   * columna conserva `DEFAULT gen_random_uuid()` como respaldo.
   */
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_usuarios' })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  /** Siempre en minúsculas (ver `ck_usuarios_correo_minusculas`). */
  @Column({ type: 'varchar', length: 254 })
  correo: string;

  /** Celular de Ecuador en E.164: `+5939XXXXXXXX` (D-14). */
  @Column({ type: 'varchar', length: 13 })
  telefono: string;

  /** Hash bcrypt (60 caracteres); nunca la clave (RNF-02). */
  @Column({ name: 'hash_clave', type: 'varchar', length: 100 })
  hashClave: string;

  @Column({ type: 'enum', enum: ROLES, enumName: 'rol_usuario' })
  rol: Rol;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /** `null` solo para el Vendedor semilla. */
  @Column({
    name: 'fecha_aceptacion_privacidad',
    type: 'timestamptz',
    nullable: true,
  })
  fechaAceptacionPrivacidad: Date | null;

  @Column({
    name: 'version_privacidad',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  versionPrivacidad: string | null;

  /**
   * Cuándo se verificó el correo con un código enviado a él (contrato de
   * correo). `null`: sin verificar (también las cuentas anteriores a esta función).
   */
  @Column({ name: 'correo_verificado_en', type: 'timestamptz', nullable: true })
  correoVerificadoEn: Date | null;

  /**
   * Cuándo se eliminó la cuenta (RF-USU-06, PA-21): sus datos personales se
   * anonimizaron y la fila se conserva para los pedidos, pagos y la bitácora
   * que la referencian. `null`: cuenta vigente.
   */
  @Column({ name: 'eliminado_en', type: 'timestamptz', nullable: true })
  eliminadoEn: Date | null;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamptz',
    default: () => 'now()',
  })
  fechaCreacion: Date;

  @Column({
    name: 'fecha_actualizacion',
    type: 'timestamptz',
    default: () => 'now()',
  })
  fechaActualizacion: Date;
}
