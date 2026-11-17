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
} from '../../../productos/validaciones.js';
import type { AdvertenciaBorrador } from '../../dominio/advertencias.js';
import {
  ESTADOS_BORRADOR,
  type EstadoBorrador,
} from '../../dominio/borrador.js';

/**
 * Tabla `borradores_producto` (RF-PRO-01, D-49). Migración:
 * CrearTablasImportacionProducto.
 *
 * - Un borrador **no es un producto**: vive aquí y nunca en `productos` hasta
 *   que se aprueba.
 * - `precio` y `precio_normal` son `numeric(7,2)` (dinero exacto), mayores que
 *   cero y pueden ser nulos; TypeORM los entrega como texto (`"12.50"`).
 * - `nombre_busqueda`: nombre sin tildes ni mayúsculas para buscar.
 * - `estado = APROBADO` si y solo si hay `id_producto`.
 * - Las claves foráneas (importación, marca, producto) se declaran por nombre
 *   de tabla y no borran en cascada.
 */
@Entity('borradores_producto')
@ForeignKey('importaciones_producto', ['idImportacion'], ['id'], {
  name: 'fk_borradores_producto_importacion',
})
@ForeignKey('marcas', ['idMarca'], ['id'], {
  name: 'fk_borradores_producto_marca',
})
@ForeignKey('productos', ['idProducto'], ['id'], {
  name: 'fk_borradores_producto_producto',
})
@Index('ix_borradores_producto_revision', [
  'idImportacion',
  'estado',
  'pagina',
  'posicion',
])
@Index('ix_borradores_producto_codigo_estado', ['codigo', 'estado'])
@Check('ck_borradores_producto_pagina', 'pagina >= 1')
@Check(
  'ck_borradores_producto_codigo',
  `codigo IS NULL OR codigo ~ '^[A-Za-z0-9]{1,20}$'`,
)
@Check('ck_borradores_producto_precio', 'precio IS NULL OR precio > 0')
@Check(
  'ck_borradores_producto_precio_normal',
  'precio_normal IS NULL OR precio_normal > 0',
)
@Check(
  'ck_borradores_producto_aprobado',
  `(estado = 'APROBADO') = (id_producto IS NOT NULL)`,
)
export class BorradorOrmEntity {
  /** El id lo genera la aplicación; la columna conserva el valor por defecto. */
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_borradores_producto',
  })
  id: string;

  @Column({ name: 'id_importacion', type: 'uuid' })
  idImportacion: string;

  @Column({ type: 'integer' })
  pagina: number;

  @Column({ type: 'integer' })
  posicion: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  codigo: string | null;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ name: 'nombre_busqueda', type: 'varchar', length: 480 })
  nombreBusqueda: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  descripcion: string | null;

  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true })
  precio: string | null;

  @Column({
    name: 'precio_normal',
    type: 'numeric',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  precioNormal: string | null;

  @Column({ name: 'id_marca', type: 'uuid' })
  idMarca: string;

  @Column({
    type: 'enum',
    enum: DISPONIBILIDADES,
    enumName: 'disponibilidad_borrador',
    default: 'DISPONIBLE',
  })
  disponibilidad: Disponibilidad;

  @Column({
    type: 'enum',
    enum: ESTADOS_BORRADOR,
    enumName: 'estado_borrador',
    default: 'PENDIENTE',
  })
  estado: EstadoBorrador;

  @Column({
    type: 'varchar',
    length: 20,
    array: true,
    default: () => `'{}'`,
  })
  advertencias: AdvertenciaBorrador[];

  @Column({ name: 'id_producto', type: 'uuid', nullable: true })
  idProducto: string | null;

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
