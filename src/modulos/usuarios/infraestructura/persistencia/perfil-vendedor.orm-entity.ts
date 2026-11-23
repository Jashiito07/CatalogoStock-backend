import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';

/**
 * Tabla `perfiles_vendedor` (RF-USU-08; contrato cuenta-y-politicas, §3).
 * Migración: AgregarEliminacionCuentaYPerfilVendedor.
 *
 * - Una fila por Vendedor: `id_usuario` es la clave primaria (único) y clave
 *   foránea a `usuarios`. Que sea un usuario con rol VENDEDOR lo comprueba el
 *   caso de uso.
 * - `whatsapp` es un celular de Ecuador en E.164, igual que `usuarios.telefono`.
 * - La provincia es una de las 24 del Ecuador; la lista vive en el dominio.
 */
@Entity('perfiles_vendedor')
@ForeignKey('usuarios', ['idUsuario'], ['id'], {
  name: 'fk_perfiles_vendedor_usuario',
})
@Check('ck_perfiles_vendedor_whatsapp', `whatsapp ~ '^\\+5939[0-9]{8}$'`)
export class PerfilVendedorOrmEntity {
  @PrimaryColumn({
    name: 'id_usuario',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_perfiles_vendedor',
  })
  idUsuario: string;

  @Column({ name: 'nombre_comercial', type: 'varchar', length: 80 })
  nombreComercial: string;

  @Column({ type: 'varchar', length: 60 })
  ciudad: string;

  @Column({ type: 'varchar', length: 40 })
  provincia: string;

  @Column({ type: 'varchar', length: 13 })
  whatsapp: string;

  @Column({
    name: 'actualizado_en',
    type: 'timestamptz',
    default: () => 'now()',
  })
  actualizadoEn: Date;
}
