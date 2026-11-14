import {
  type ImagenPublica,
  ordenarPorPosicion,
} from '../../dominio/imagen.js';
import type { ImagenRepositorio } from '../puertos/imagen.repositorio.js';

/**
 * Imágenes de los productos para armar sus respuestas (RF-PRO-01): una sola
 * consulta para varios productos. Cada lista va ordenada; la primera es la
 * principal.
 */
export class ConsultarImagenesCasoUso {
  constructor(private readonly imagenes: ImagenRepositorio) {}

  /** Mapa `idProducto → imágenes` (todos los ids pedidos tienen entrada). */
  async porProductos(
    idsProducto: readonly string[],
  ): Promise<Map<string, ImagenPublica[]>> {
    const resultado = new Map<string, ImagenPublica[]>(
      idsProducto.map((id) => [id, []]),
    );
    if (idsProducto.length === 0) {
      return resultado;
    }
    const filas = ordenarPorPosicion(
      await this.imagenes.listarPorProductos(idsProducto),
    );
    for (const imagen of filas) {
      resultado.get(imagen.productoId)?.push(imagen.aPublico());
    }
    return resultado;
  }
}
