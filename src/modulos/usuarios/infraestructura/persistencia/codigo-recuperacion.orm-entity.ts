import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  PROPOSITOS_CODIGO,
  type PropositoCodigo,
} from '../../dominio/codigo-recuperacion.js';
import { UsuarioOrmEntity } from './usuario.orm-entity.js';

/**
 * Tabla `codigos_recuperacion` (RF-USU-05, D-35, D-39). Migraciones:
 * CrearTablaCodigosRecuperacion y AgregarCorreoVerificadoYPropositoCodigos.
 *
 * Solo se guarda el HMAC-SHA256 del código (`hash_codigo`), nunca el código.
 * Un código «pendiente» no tiene `fecha_uso` ni `fecha_invalidacion`; la base
 * admite uno solo por usuario y propósito (`uq_codigos_recuperacion_pendiente`).
 */
@Entity('codigos_recuperacion')
@Index('ix_codigos_recuperacion_usuario_fecha', ['idUsuario', 'fechaCreacion'])
@Index('uq_codigos_recuperacion_pendiente', ['idUsuario', 'proposito'], {
  unique: true,
  where: 'fecha_uso IS NULL AND fecha_invalidacion IS NULL',
})
@Check(
  'ck_codigos_recuperacion_generado_por',
  `proposito <> 'RECUPERACION_ASISTIDA' OR generado_por IS NOT NULL`,
)
@Check(
  'ck_codigos_recuperacion_vencimiento',
  'fecha_vencimiento > fecha_creacion',
)
@Check(
  'ck_codigos_recuperacion_intentos',
  'intentos_fallidos >= 0 AND intentos_fallidos <= 5',
)
export class CodigoRecuperacionOrmEntity {
  /** El id lo genera la aplicación; la columna conserva el valor por defecto. */
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_codigos_recuperacion',
  })
  id: string;

  @Column({ name: 'id_usuario', type: 'uuid' })
  idUsuario: string;

  @ManyToOne(() => UsuarioOrmEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'id_usuario',
    foreignKeyConstraintName: 'fk_codigos_recuperacion_usuario',
  })
  usuario?: UsuarioOrmEntity;

  /** HMAC-SHA256 en hexadecimal (64 caracteres) con `RECUPERACION_SECRETO`. */
  @Column({ name: 'hash_codigo', type: 'char', length: 64 })
  hashCodigo: string;

  /**
   * Para qué se generó el código. Los códigos anteriores al contrato de correo
   * son de recuperación asistida.
   */
  @Column({
    type: 'enum',
    enum: PROPOSITOS_CODIGO,
    enumName: 'proposito_codigo',
    default: 'RECUPERACION_ASISTIDA',
  })
  proposito: PropositoCodigo;

  /** Vendedor que generó el código; `null` si lo generó el sistema (correo). */
  @Column({ name: 'generado_por', type: 'uuid', nullable: true })
  generadoPor: string | null;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamptz',
    default: () => 'now()',
  })
  fechaCreacion: Date;

  @Column({ name: 'fecha_vencimiento', type: 'timestamptz' })
  fechaVencimiento: Date;

  @Column({ name: 'fecha_uso', type: 'timestamptz', nullable: true })
  fechaUso: Date | null;

  @Column({ name: 'fecha_invalidacion', type: 'timestamptz', nullable: true })
  fechaInvalidacion: Date | null;

  @Column({ name: 'intentos_fallidos', type: 'integer', default: 0 })
  intentosFallidos: number;
}
