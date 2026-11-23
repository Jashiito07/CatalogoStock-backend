import { claveDeEmparejamiento } from '../../productos/validaciones.js';
import type { Borrador, ProductoExistente } from '../dominio/borrador.js';
import type { ProductosExistentes } from './puertos/productos-existentes.puerto.js';

/** Resultado de emparejar un borrador pendiente con los productos publicados (D-57). */
export interface Emparejamiento {
  /** El producto cuyo precio se actualizará al aprobar, o `null` (se creará uno). */
  existente: ProductoExistente | null;
  /** Varios productos sin código tienen el nombre: no se empareja (`EMPAREJAMIENTO_AMBIGUO`). */
  ambiguo: boolean;
}

function agrupar<T>(
  mapa: Map<string, Set<T>>,
  marcaId: string,
  valor: T,
): void {
  const conjunto = mapa.get(marcaId) ?? new Set<T>();
  conjunto.add(valor);
  mapa.set(marcaId, conjunto);
}

/**
 * Empareja cada borrador **pendiente** con un producto publicado (D-57):
 *
 * - **Con código**: el producto no eliminado de su marca con ese código
 *   (`emparejadoPor: CODIGO`).
 * - **Sin código** (y sin `NOMBRE_DUDOSO`): el producto no eliminado de su
 *   marca, **sin código**, con el mismo nombre sin distinguir mayúsculas,
 *   tildes ni signos, si hay **exactamente uno** (`emparejadoPor: NOMBRE`).
 *   Si hay varios, `ambiguo` y no se empareja. Nunca se empareja por nombre con
 *   un producto que tiene código ni un borrador con código.
 *
 * Solo cuenta los productos del Vendedor (D-60). Una consulta por marca y por
 * tipo de emparejamiento. Devuelve un mapa
 * `idBorrador → Emparejamiento` solo con los pendientes; todos tienen entrada.
 */
export async function emparejarBorradores(
  idVendedor: string,
  borradores: readonly Borrador[],
  productos: ProductosExistentes,
): Promise<Map<string, Emparejamiento>> {
  const pendientes = borradores.filter((b) => b.esPendiente);
  const codigosPorMarca = new Map<string, Set<string>>();
  const nombresPorMarca = new Map<string, Set<string>>();
  for (const borrador of pendientes) {
    if (borrador.codigo !== null) {
      agrupar(codigosPorMarca, borrador.marcaId, borrador.codigo);
    } else if (borrador.puedeEmparejarPorNombre) {
      agrupar(nombresPorMarca, borrador.marcaId, borrador.nombre);
    }
  }

  const porCodigo = new Map<string, ProductoExistente>();
  for (const [marcaId, codigos] of codigosPorMarca) {
    for (const producto of await productos.buscarPorCodigos(
      idVendedor,
      marcaId,
      [...codigos],
    )) {
      porCodigo.set(`${marcaId}:${producto.codigo}`, {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        emparejadoPor: 'CODIGO',
      });
    }
  }

  const porNombre = new Map<string, ProductoExistente[]>();
  for (const [marcaId, nombres] of nombresPorMarca) {
    for (const producto of await productos.buscarSinCodigoPorNombres(
      idVendedor,
      marcaId,
      [...nombres],
    )) {
      const clave = `${marcaId}:${claveDeEmparejamiento(producto.nombre)}`;
      const lista = porNombre.get(clave) ?? [];
      lista.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        emparejadoPor: 'NOMBRE',
      });
      porNombre.set(clave, lista);
    }
  }

  const resultado = new Map<string, Emparejamiento>();
  for (const borrador of pendientes) {
    if (borrador.codigo !== null) {
      resultado.set(borrador.id, {
        existente: porCodigo.get(`${borrador.marcaId}:${borrador.codigo}`) ?? null,
        ambiguo: false,
      });
    } else if (borrador.puedeEmparejarPorNombre) {
      const candidatos =
        porNombre.get(
          `${borrador.marcaId}:${claveDeEmparejamiento(borrador.nombre)}`,
        ) ?? [];
      resultado.set(borrador.id, {
        existente: candidatos.length === 1 ? candidatos[0] : null,
        ambiguo: candidatos.length > 1,
      });
    } else {
      resultado.set(borrador.id, { existente: null, ambiguo: false });
    }
  }
  return resultado;
}
