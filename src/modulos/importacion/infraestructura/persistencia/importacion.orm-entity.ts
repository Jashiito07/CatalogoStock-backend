import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  ESTADOS_IMPORTACION,
  type EstadoImportacion,
} from '../../dominio/importacion.js';

/**
 * Tabla `importaciones_producto` (RF-PRO-01, D-49, D-57). Migraciones:
 * CrearTablasImportacionProducto y AgregarCodigoProductoYCicloImportacion.
 *
 * - El PDF no se guarda; `huella` es su SHA-256 en hexadecimal y es única
 *   (idempotencia: el mismo archivo no se procesa dos veces). Al eliminar la
 *   importación la huella se libera.
 * - La clave foránea a `marcas` se declara por nombre de tabla (este módulo no
 *   importa la entidad de otro) y no borra en cascada.
 * - `estado` (D-57): `VIGENTE` (la más reciente de su marca; el índice único
 *   parcial impide dos por marca) o `ARCHIVADA`, con `archivada_en`. A los 6
 *   meses calendario de `archivada_en` se elimina sola.
 */
@Entity('importaciones_producto')
@ForeignKey('marcas', ['idMarca'], ['id'], {
  name: 'fk_importaciones_producto_marca',
})
@Index('uq_importaciones_producto_huella', ['huella'], { unique: true })
@Index('uq_importaciones_producto_vigente_marca', ['idMarca'], {
  unique: true,
  where: `"estado" = 'VIGENTE'`,
})
@Check('ck_importaciones_producto_huella', `huella ~ '^[0-9a-f]{64}$'`)
@Check('ck_importaciones_producto_paginas', 'paginas > 0')
@Check(
  'ck_importaciones_producto_archivada',
  `(estado = 'ARCHIVADA') = (archivada_en IS NOT NULL)`,
)
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
    type: 'enum',
    enum: ESTADOS_IMPORTACION,
    enumName: 'estado_importacion',
    default: 'VIGENTE',
  })
  estado: EstadoImportacion;

  @Column({ name: 'archivada_en', type: 'timestamptz', nullable: true })
  archivadaEn: Date | null;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamptz',
    default: () => 'now()',
  })
  fechaCreacion: Date;
}
