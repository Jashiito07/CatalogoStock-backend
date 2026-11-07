import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
  ENTIDADES_AUDITORIA,
  type EntidadAuditoria,
} from '../../dominio/catalogo-auditoria.js';
import type { DetalleAuditoria } from '../../dominio/detalle-auditoria.js';

/**
 * Tabla `auditoria` (RF-USU-04, contrato de auditoría). Migración:
 * CrearTablaAuditoria.
 *
 * - Solo se inserta y se consulta: no hay rutas ni métodos para editar o borrar.
 * - `id_usuario` **no** tiene clave foránea a `usuarios`: la bitácora es de
 *   otro módulo y debe conservar el registro aunque el usuario se elimine en
 *   el futuro (se mostrará «Usuario eliminado»).
 * - Índices para los filtros de `GET /auditoria`, todos con `fecha` para el
 *   orden descendente.
 */
@Entity('auditoria')
@Index('ix_auditoria_fecha', ['fecha'])
@Index('ix_auditoria_accion_fecha', ['accion', 'fecha'])
@Index('ix_auditoria_id_usuario_fecha', ['idUsuario', 'fecha'])
@Index('ix_auditoria_entidad_fecha', ['entidad', 'idEntidad', 'fecha'])
@Check('ck_auditoria_id_entidad', 'id_entidad IS NULL OR entidad IS NOT NULL')
@Check('ck_auditoria_detalle_objeto', `jsonb_typeof(detalle) = 'object'`)
export class RegistroActividadOrmEntity {
  /** El id lo genera la aplicación; la columna conserva el valor por defecto. */
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_auditoria' })
  id: string;

  /** Asignada por el servidor. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha: Date;

  @Column({
    type: 'enum',
    enum: ACCIONES_AUDITORIA,
    enumName: 'accion_auditoria',
  })
  accion: AccionAuditoria;

  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario: string | null;

  @Column({
    type: 'enum',
    enum: ENTIDADES_AUDITORIA,
    enumName: 'entidad_auditoria',
    nullable: true,
  })
  entidad: EntidadAuditoria | null;

  @Column({ name: 'id_entidad', type: 'uuid', nullable: true })
  idEntidad: string | null;

  /** Sin datos sensibles (salvaguarda del dominio). */
  // TypeORM lee el valor por defecto de PostgreSQL sin el `::jsonb`; así
  // `migracion:generar` no ve diferencias con la migración.
  @Column({ type: 'jsonb', default: () => `'{}'` })
  detalle: DetalleAuditoria;
}
