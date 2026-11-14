import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { ProductoNoEncontradoError } from '../../dominio/errores-producto.js';
import { ImagenNoEncontradaError } from '../../dominio/errores-imagen.js';
import { compactarOrden } from '../../dominio/imagen.js';
import type { AlmacenImagenes } from '../puertos/almacen-imagenes.puerto.js';
import type { ImagenRepositorio } from '../puertos/imagen.repositorio.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';

export interface DatosEliminarImagen {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idProducto: string;
  idImagen: string;
}

/**
 * Elimina una imagen (RF-PRO-01, D-46): borra la fila, reasigna posiciones (la
 * siguiente pasa a ser la principal si se quitó la principal) y registra
 * `IMAGEN_ELIMINADA` en la misma transacción. El archivo se borra del disco
 * **después** de confirmar la transacción, para no perder el archivo si esta
 * falla. (La eliminación lógica del producto, en cambio, conserva sus imágenes.)
 */
export class EliminarImagenCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly imagenes: ImagenRepositorio,
    private readonly almacen: AlmacenImagenes,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosEliminarImagen): Promise<void> {
    const nombreArchivo = await this.unidadTrabajo.ejecutar(async () => {
      const producto = await this.productos.bloquearPorId(datos.idProducto);
      if (producto === null) {
        throw new ProductoNoEncontradoError();
      }
      const imagen = await this.imagenes.buscar(producto.id, datos.idImagen);
      if (imagen === null || !(await this.imagenes.eliminar(imagen.id))) {
        throw new ImagenNoEncontradaError();
      }
      const restantes = await this.imagenes.listarPorProducto(producto.id);
      await this.imagenes.guardarOrden(compactarOrden(restantes));
      await this.auditoria.registrar({
        accion: 'IMAGEN_ELIMINADA',
        idUsuario: datos.idVendedor,
        entidad: 'PRODUCTO',
        idEntidad: producto.id,
        detalle: { idImagen: imagen.id },
      });
      return imagen.nombreArchivo;
    });
    await this.almacen.eliminar(nombreArchivo);
  }
}
