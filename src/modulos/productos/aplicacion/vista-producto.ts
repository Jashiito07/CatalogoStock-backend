import type { MarcaPublica } from '../../marcas/index.js';
import type { ProductoPublico } from '../dominio/producto.js';
import type { DirectorioMarcas } from './puertos/directorio-marcas.puerto.js';

/** Un producto junto con la marca a la que pertenece (resumen de marca del contrato). */
export interface VistaProducto {
  producto: ProductoPublico;
  marca: MarcaPublica;
}

/** Une cada producto con su marca con una sola consulta de marcas. */
export async function componerVistas(
  productos: readonly ProductoPublico[],
  marcas: DirectorioMarcas,
): Promise<VistaProducto[]> {
  if (productos.length === 0) {
    return [];
  }
  const ids = [...new Set(productos.map((producto) => producto.marcaId))];
  const porId = new Map(
    (await marcas.buscarPorIds(ids)).map((marca) => [marca.id, marca]),
  );
  return productos.map((producto) => {
    const marca = porId.get(producto.marcaId);
    if (marca === undefined) {
      // La clave foránea lo impide: es un fallo de integridad, no un 404.
      throw new Error('Un producto apunta a una marca que no existe.');
    }
    return { producto, marca };
  });
}
