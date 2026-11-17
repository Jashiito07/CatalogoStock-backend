import type { ProductoPublico } from '../dominio/producto.js';
import type {
  CrearProductoCasoUso,
  DatosCrearProducto,
} from './casos-uso/crear-producto.caso-uso.js';
import type { ProductoRepositorio } from './puertos/producto.repositorio.js';

/**
 * Servicio público del módulo `productos` para los demás módulos del backend
 * (imágenes en 2.4; importación del catálogo en 2.8; carrito, pedidos e
 * inventario más adelante). Ningún otro módulo accede a la tabla `productos`.
 */
export class ProductosServicio {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly crearProducto: CrearProductoCasoUso,
  ) {}

  /** El producto no eliminado o `null` (un eliminado se trata como inexistente, PA-07). */
  async buscarPorId(id: string): Promise<ProductoPublico | null> {
    const producto = await this.productos.buscarPorId(id);
    return producto === null ? null : producto.aPublico();
  }

  /**
   * Crea un producto con exactamente las mismas validaciones y la misma
   * bitácora (`PRODUCTO_CREADO`) que `POST /productos` (RF-PRO-01, CA-04).
   * Si se llama dentro de una unidad de trabajo, se une a su transacción (la
   * importación del catálogo aprueba cada borrador así, 2.8).
   */
  async crear(datos: DatosCrearProducto): Promise<ProductoPublico> {
    const vista = await this.crearProducto.ejecutar(datos);
    return vista.producto;
  }
}
