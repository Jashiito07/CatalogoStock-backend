import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type {
  ProductoPublico,
  ProductosServicio,
} from '../../../productos/index.js';
import type {
  ProductoAusente,
  ProductoConCodigo,
  ProductoSinCodigo,
  ProductosExistentes,
} from '../../aplicacion/puertos/productos-existentes.puerto.js';

/** Los productos del servicio tienen código cuando se buscan por él; si no, es un fallo de integridad. */
function conCodigo(producto: ProductoPublico): ProductoConCodigo {
  if (producto.codigo === null) {
    throw new Error('Un producto buscado por código no tiene código.');
  }
  return {
    id: producto.id,
    nombre: producto.nombre,
    codigo: producto.codigo,
    precio: producto.precio,
  };
}

function sinCodigo(producto: ProductoPublico): ProductoSinCodigo {
  return { id: producto.id, nombre: producto.nombre, precio: producto.precio };
}

/**
 * Adaptador del puerto ProductosExistentes con el servicio público del módulo
 * `productos` (D-57): `importacion` nunca lee ni escribe la tabla `productos`.
 */
export class ProductosExistentesModuloProductos implements ProductosExistentes {
  constructor(private readonly productos: ProductosServicio) {}

  async buscarPorCodigos(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<ProductoConCodigo[]> {
    return (
      await this.productos.buscarPorCodigos(idVendedor, marcaId, codigos)
    ).map(conCodigo);
  }

  codigosExistentes(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Set<string>> {
    return this.productos.codigosExistentes(idVendedor, marcaId, codigos);
  }

  async bloquearPorCodigo(
    idVendedor: string,
    marcaId: string,
    codigo: string,
  ): Promise<ProductoConCodigo | null> {
    const producto = await this.productos.bloquearPorCodigo(
      idVendedor,
      marcaId,
      codigo,
    );
    return producto === null ? null : conCodigo(producto);
  }

  async buscarSinCodigoPorNombres(
    idVendedor: string,
    marcaId: string,
    nombres: readonly string[],
  ): Promise<ProductoSinCodigo[]> {
    return (
      await this.productos.buscarSinCodigoPorNombres(
        idVendedor,
        marcaId,
        nombres,
      )
    ).map(sinCodigo);
  }

  async bloquearSinCodigoPorNombre(
    idVendedor: string,
    marcaId: string,
    nombre: string,
  ): Promise<ProductoSinCodigo[]> {
    return (
      await this.productos.bloquearSinCodigoPorNombre(
        idVendedor,
        marcaId,
        nombre,
      )
    ).map(sinCodigo);
  }

  actualizarPrecio(datos: {
    idVendedor: string;
    idProducto: string;
    precio: string;
  }): Promise<void> {
    return this.productos.actualizarPrecio(datos);
  }

  async listarAusentes(
    idVendedor: string,
    marcaId: string,
    codigosPresentes: readonly string[],
    paginacion: Paginacion,
  ): Promise<Pagina<ProductoAusente>> {
    const pagina = await this.productos.listarAusentes(
      idVendedor,
      marcaId,
      codigosPresentes,
      paginacion,
    );
    return {
      ...pagina,
      elementos: pagina.elementos.map((producto) => ({
        ...conCodigo(producto),
        disponibilidad: producto.disponibilidad,
      })),
    };
  }
}
