import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { ProductoNoEncontradoError } from '../../dominio/errores-producto.js';
import {
  type ImagenPublica,
  ordenarPorPosicion,
  reordenarImagenes,
} from '../../dominio/imagen.js';
import type { ImagenRepositorio } from '../puertos/imagen.repositorio.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';

export interface DatosReordenarImagenes {
  idProducto: string;
  /** Todas las imágenes del producto, en el nuevo orden (la primera es la principal). */
  ids: readonly string[];
}

/**
 * Reordena las imágenes de un producto y elige la principal (RF-PRO-01, D-46).
 * `ids` debe traer todas las imágenes, sin repetir ni ajenas (400). El contrato
 * no define acción de bitácora para esta operación.
 */
export class ReordenarImagenesCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly imagenes: ImagenRepositorio,
    private readonly unidadTrabajo: UnidadDeTrabajo,
  ) {}

  async ejecutar(datos: DatosReordenarImagenes): Promise<ImagenPublica[]> {
    return this.unidadTrabajo.ejecutar(async () => {
      const producto = await this.productos.bloquearPorId(datos.idProducto);
      if (producto === null) {
        throw new ProductoNoEncontradoError();
      }
      const actuales = await this.imagenes.listarPorProducto(producto.id);
      const nuevas = reordenarImagenes(actuales, datos.ids);
      await this.imagenes.guardarOrden(nuevas);
      return ordenarPorPosicion(nuevas).map((imagen) => imagen.aPublico());
    });
  }
}
