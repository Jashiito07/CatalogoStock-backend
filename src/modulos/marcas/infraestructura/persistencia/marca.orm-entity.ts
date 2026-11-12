import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Tabla `marcas` (RF-PRO-04, D-43). Migración: CrearTablaMarcas.
 *
 * `nombre_busqueda` guarda el nombre sin tildes, en minúsculas y con espacios
 * simples; su índice único hace que «Ésika» y «esika» sean la misma marca.
 * No se borra ninguna marca: se desactiva (`activa`).
 */
@Entity('marcas')
@Index('uq_marcas_nombre_busqueda', ['nombreBusqueda'], { unique: true })
@Check('ck_marcas_color', `color ~ '^#[0-9A-F]{6}$'`)
@Check(
  'ck_marcas_color_acento',
  `color_acento IS NULL OR color_acento ~ '^#[0-9A-F]{6}$'`,
)
@Check('ck_marcas_orden', 'orden >= 0')
export class MarcaOrmEntity {
  /** El id lo genera la aplicación; la columna conserva el valor por defecto. */
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_marcas' })
  id: string;

  @Column({ type: 'varchar', length: 40 })
  nombre: string;

  @Column({ name: 'nombre_busqueda', type: 'varchar', length: 160 })
  nombreBusqueda: string;

  /** `#RRGGBB` en mayúsculas. */
  @Column({ type: 'char', length: 7 })
  color: string;

  @Column({ name: 'color_acento', type: 'char', length: 7, nullable: true })
  colorAcento: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @Column({ type: 'integer', default: 0 })
  orden: number;

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
