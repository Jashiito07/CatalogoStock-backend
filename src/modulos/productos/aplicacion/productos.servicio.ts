import type { ProductoPublico } from '../dominio/producto.js';
import type { ProductoRepositorio } from './puertos/producto.repositorio.js';

/**
 * Servicio público del módulo `productos` para los demás módulos del backend
 * (imágenes en 2.4; carrito, pedidos e inventario más adelante). Ningún otro
 * módulo accede a la tabla `productos`.
 */
export class ProductosServicio {
  constructor(private readonly productos: ProductoRepositorio) {}

  /** El producto no eliminado o `null` (un eliminado se trata como inexistente, PA-07). */
  async buscarPorId(id: string): Promise<ProductoPublico | null> {
    const producto = await this.productos.buscarPorId(id);
    return producto === null ? null : producto.aPublico();
  }
}
