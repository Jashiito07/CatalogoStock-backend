import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Tabla `importaciones_producto` (RF-PRO-01, D-49). Migración:
 * CrearTablasImportacionProducto.
 *
 * - El PDF no se guarda; `huella` es su SHA-256 en hexadecimal y es única
 *   (idempotencia: el mismo archivo no se procesa dos veces).
 * - La clave foránea a `marcas` se declara por nombre de tabla (este módulo no
 *   importa la entidad de otro) y no borra en cascada.
 */
@Entity('importaciones_producto')
@ForeignKey('marcas', ['idMarca'], ['id'], {
  name: 'fk_importaciones_producto_marca',
})
@Index('uq_importaciones_producto_huella', ['huella'], { unique: true })
@Check('ck_importaciones_producto_huella', `huella ~ '^[0-9a-f]{64}$'`)
@Check('ck_importaciones_producto_paginas', 'paginas > 0')
export class ImportacionOrmEntity {
  /** El id lo genera la aplicación; la columna conserva el valor por defecto. */
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_importaciones_producto',
  })
  id: string;

  @Column({ name: 'nombre_archivo', type: 'varchar', length: 120 })
  nombreArchivo: string;

  @Column({ type: 'varchar', length: 64 })
  huella: string;

  @Column({ name: 'id_marca', type: 'uuid' })
  idMarca: string;

  @Column({ type: 'integer' })
  paginas: number;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamptz',
    default: () => 'now()',
  })
  fechaCreacion: Date;
}
