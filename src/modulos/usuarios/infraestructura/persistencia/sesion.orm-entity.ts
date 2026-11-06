import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CANALES, type Canal } from '../../dominio/canal.js';
import {
  MOTIVOS_REVOCACION,
  type MotivoRevocacion,
} from '../../dominio/sesion.js';
import { UsuarioOrmEntity } from './usuario.orm-entity.js';

/**
 * Tabla `sesiones` (RF-USU-01, D-09, D-19). Migración: CrearTablaSesiones.
 *
 * Cada fila es un token de renovación. Solo se guarda su hash SHA-256
 * (`hash_token`), nunca el token. Las filas de una misma cadena de rotación
 * comparten `familia`.
 */
@Entity('sesiones')
@Index('uq_sesiones_hash_token', ['hashToken'], { unique: true })
@Index('ix_sesiones_familia', ['familia'])
@Index('ix_sesiones_id_usuario', ['idUsuario'])
@Check(
  'ck_sesiones_revocacion',
  '(fecha_revocacion IS NULL) = (motivo_revocacion IS NULL)',
)
@Check('ck_sesiones_vencimiento', 'fecha_vencimiento > fecha_creacion')
export class SesionOrmEntity {
  /** El id lo genera la aplicación; la columna conserva el valor por defecto. */
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_sesiones' })
  id: string;

  @Column({ name: 'id_usuario', type: 'uuid' })
  idUsuario: string;

  @ManyToOne(() => UsuarioOrmEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'id_usuario',
    foreignKeyConstraintName: 'fk_sesiones_usuario',
  })
  usuario?: UsuarioOrmEntity;

  @Column({ type: 'uuid' })
  familia: string;

  /** D-19: `APP` (Cliente) o `PANEL` (Vendedor); la renovación lo conserva. */
  @Column({ type: 'enum', enum: CANALES, enumName: 'canal_sesion' })
  canal: Canal;

  /** SHA-256 en hexadecimal del token de renovación (64 caracteres). */
  @Column({ name: 'hash_token', type: 'char', length: 64 })
  hashToken: string;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamptz',
    default: () => 'now()',
  })
  fechaCreacion: Date;

  @Column({ name: 'fecha_vencimiento', type: 'timestamptz' })
  fechaVencimiento: Date;

  @Column({ name: 'fecha_revocacion', type: 'timestamptz', nullable: true })
  fechaRevocacion: Date | null;

  @Column({
    name: 'motivo_revocacion',
    type: 'enum',
    enum: MOTIVOS_REVOCACION,
    enumName: 'motivo_revocacion_sesion',
    nullable: true,
  })
  motivoRevocacion: MotivoRevocacion | null;
}
