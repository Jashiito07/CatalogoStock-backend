import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { ProductoNoEncontradoError } from '../../dominio/errores-producto.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';

export interface DatosEliminarProducto {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idProducto: string;
}

/**
 * Elimina un producto de forma **lógica** (RF-PRO-03, PA-07, CA-06): deja de
 * verse en el catálogo y el listado, y su historial se conserva. Un segundo
 * intento responde 404. `PRODUCTO_ELIMINADO` se registra en la misma
 * transacción.
 */
export class EliminarProductoCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosEliminarProducto): Promise<void> {
    await this.unidadTrabajo.ejecutar(async () => {
      const eliminado = await this.productos.marcarEliminado(
        datos.idProducto,
        this.reloj.ahora(),
      );
      if (!eliminado) {
        throw new ProductoNoEncontradoError();
      }
      await this.auditoria.registrar({
        accion: 'PRODUCTO_ELIMINADO',
        idUsuario: datos.idVendedor,
        entidad: 'PRODUCTO',
        idEntidad: datos.idProducto,
        detalle: {},
      });
    });
  }
}
