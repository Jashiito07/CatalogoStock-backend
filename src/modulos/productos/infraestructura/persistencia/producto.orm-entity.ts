import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  DISPONIBILIDADES,
  type Disponibilidad,
} from '../../dominio/disponibilidad.js';

/**
 * Tabla `productos` (RF-PRO-01 a RF-PRO-05, PA-07). Migración: CrearTablaProductos.
 *
 * - `precio` es `numeric(7,2)` (dinero exacto) y mayor que cero; TypeORM lo
 *   entrega como texto («12.50»), nunca como número de punto flotante.
 * - `nombre_busqueda` y `descripcion_busqueda`: textos sin tildes ni mayúsculas
 *   para buscar (RF-CAT-03) y ordenar por nombre.
 * - Eliminación lógica: `eliminado_en` con fecha; la fila se conserva (PA-07).
 * - La clave foránea a `marcas` se declara por nombre de tabla: `productos` no
 *   importa la entidad de otro módulo.
 */
@Entity('productos')
@ForeignKey('marcas', ['idMarca'], ['id'], { name: 'fk_productos_marca' })
@Index('ix_productos_id_marca', ['idMarca'])
@Index('ix_productos_nombre_busqueda', ['nombreBusqueda'])
@Index('ix_productos_eliminado_en', ['eliminadoEn'])
@Check('ck_productos_precio', 'precio > 0')
export class ProductoOrmEntity {
  /** El id lo genera la aplicación; la columna conserva el valor por defecto. */
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_productos' })
  id: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ name: 'nombre_busqueda', type: 'varchar', length: 480 })
  nombreBusqueda: string;

  @Column({ name: 'id_marca', type: 'uuid' })
  idMarca: string;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  precio: string;

  @Column({ type: 'varchar', length: 2000, default: '' })
  descripcion: string;

  @Column({
    name: 'descripcion_busqueda',
    type: 'varchar',
    length: 8000,
    default: '',
  })
  descripcionBusqueda: string;

  @Column({
    type: 'enum',
    enum: DISPONIBILIDADES,
    enumName: 'disponibilidad_producto',
    default: 'DISPONIBLE',
  })
  disponibilidad: Disponibilidad;

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
