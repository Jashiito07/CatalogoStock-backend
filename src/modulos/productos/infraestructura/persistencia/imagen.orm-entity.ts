import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { type TipoImagen } from '../../dominio/imagen.js';

/**
 * Tabla `imagenes_producto` (RF-PRO-01, D-46). Migración: CrearTablaImagenesProducto.
 *
 * - `orden`: posición (0 = principal); la «principal» no se guarda aparte, se
 *   deduce de `orden = 0` para que nunca haya dos.
 * - `ruta_relativa`: `productos/<uuid>.<ext>` relativa a `RUTA_ALMACENAMIENTO`;
 *   nunca la ruta completa del servidor.
 * - `tipo`: `jpg`, `png` o `webp`, detectado por contenido.
 * - `tamanio_bytes`: de 1 a 2 097 152 (2 MB).
 * - La clave foránea a `productos` no borra en cascada: los productos solo se
 *   eliminan de forma lógica (PA-07) y sus imágenes se conservan.
 */
@Entity('imagenes_producto')
@ForeignKey('productos', ['idProducto'], ['id'], {
  name: 'fk_imagenes_producto_producto',
})
@Index('ix_imagenes_producto_producto_orden', ['idProducto', 'orden'])
@Index('uq_imagenes_producto_ruta', ['rutaRelativa'], { unique: true })
@Check('ck_imagenes_producto_orden', 'orden >= 0')
@Check('ck_imagenes_producto_tipo', `tipo IN ('jpg', 'png', 'webp')`)
@Check(
  'ck_imagenes_producto_tamanio',
  'tamanio_bytes > 0 AND tamanio_bytes <= 2097152',
)
export class ImagenOrmEntity {
  /** El id lo genera la aplicación y es también el nombre del archivo. */
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_imagenes_producto',
  })
  id: string;

  @Column({ name: 'id_producto', type: 'uuid' })
  idProducto: string;

  @Column({ type: 'integer' })
  orden: number;

  @Column({ name: 'ruta_relativa', type: 'varchar', length: 80 })
  rutaRelativa: string;

  @Column({ type: 'varchar', length: 10 })
  tipo: TipoImagen;

  @Column({ name: 'tamanio_bytes', type: 'integer' })
  tamanioBytes: number;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamptz',
    default: () => 'now()',
  })
  fechaCreacion: Date;
}
