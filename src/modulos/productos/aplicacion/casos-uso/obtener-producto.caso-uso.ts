import type { ActorAutenticado } from '../../../usuarios/index.js';
import { ProductoNoEncontradoError } from '../../dominio/errores-producto.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';
import type { VistaProducto } from '../vista-producto.js';

/**
 * Detalle de un producto (RF-PRO-01). 404 si no existe, está eliminado (PA-07)
 * o su marca está inactiva y quien consulta es un Cliente.
 */
export class ObtenerProductoCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly marcas: DirectorioMarcas,
  ) {}

  async ejecutar(
    actor: ActorAutenticado,
    idProducto: string,
  ): Promise<VistaProducto> {
    const producto = await this.productos.buscarPorId(idProducto);
    if (producto === null) {
      throw new ProductoNoEncontradoError();
    }
    const marca = await this.marcas.buscarPorId(producto.marcaId);
    if (marca === null || (actor.rol === 'CLIENTE' && !marca.activa)) {
      throw new ProductoNoEncontradoError();
    }
    return { producto: producto.aPublico(), marca };
  }
}
