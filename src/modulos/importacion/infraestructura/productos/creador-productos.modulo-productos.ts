import type { ProductosServicio } from '../../../productos/index.js';
import type {
  CreadorProductos,
  DatosProductoAprobado,
} from '../../aplicacion/puertos/creador-productos.puerto.js';

/**
 * Adaptador del puerto CreadorProductos con el servicio público del módulo
 * `productos`: las mismas validaciones y la misma bitácora que `POST
 * /productos`, y la transacción de quien llama (importacion nunca escribe en
 * la tabla `productos`).
 */
export class CreadorProductosModuloProductos implements CreadorProductos {
  constructor(private readonly productos: ProductosServicio) {}

  async crear(datos: DatosProductoAprobado): Promise<string> {
    const producto = await this.productos.crear({
      idVendedor: datos.idVendedor,
      nombre: datos.nombre,
      codigo: datos.codigo,
      marcaId: datos.marcaId,
      precio: datos.precio,
      descripcion: datos.descripcion,
      disponibilidad: datos.disponibilidad,
    });
    return producto.id;
  }
}
