import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { ActorAutenticado } from '../../../usuarios/index.js';
import type { Disponibilidad } from '../../dominio/disponibilidad.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type {
  FiltroProductos,
  ProductoRepositorio,
} from '../puertos/producto.repositorio.js';
import { componerVistas, type VistaProducto } from '../vista-producto.js';

export interface DatosListarProductos {
  marcaId?: string;
  /** Clave de búsqueda ya normalizada (sin tildes ni mayúsculas). */
  clave?: string;
  disponibilidad?: Disponibilidad;
  paginacion: Paginacion;
}

/**
 * Lista productos paginados (RF-PRO-01, RF-CAT-03, RF-INV-03), por nombre.
 * Incluye los agotados. Los eliminados no aparecen (PA-07). Al Cliente solo se
 * le devuelven productos de marcas activas; el Vendedor ve todos.
 */
export class ListarProductosCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly marcas: DirectorioMarcas,
  ) {}

  async ejecutar(
    actor: ActorAutenticado,
    datos: DatosListarProductos,
  ): Promise<Pagina<VistaProducto>> {
    const filtro: FiltroProductos = {
      clave: datos.clave,
      disponibilidad: datos.disponibilidad,
    };
    const marcaId = datos.marcaId?.toLowerCase();

    if (actor.rol === 'CLIENTE') {
      const activas = (await this.marcas.listarActivas()).map((m) => m.id);
      filtro.marcaIds =
        marcaId === undefined
          ? activas
          : activas.filter((id) => id === marcaId);
    } else if (marcaId !== undefined) {
      filtro.marcaIds = [marcaId];
    }

    if (filtro.marcaIds?.length === 0) {
      return {
        elementos: [],
        pagina: datos.paginacion.pagina,
        tamanio: datos.paginacion.tamanio,
        total: 0,
      };
    }

    const pagina = await this.productos.listar(filtro, datos.paginacion);
    const vistas = await componerVistas(
      pagina.elementos.map((producto) => producto.aPublico()),
      this.marcas,
    );
    return { ...pagina, elementos: vistas };
  }
}
