import type { Marca } from '../../dominio/marca.js';

/** Puerto de persistencia de marcas (tabla `marcas`). */
export interface MarcaRepositorio {
  buscarPorId(id: string): Promise<Marca | null>;

  /** Marca cuyo nombre tiene esa clave (sin tildes ni mayúsculas), o `null`. */
  buscarPorClaveNombre(clave: string): Promise<Marca | null>;

  buscarPorIds(ids: readonly string[]): Promise<Marca[]>;

  /** Ordenadas por `orden` y luego por nombre. */
  listar(incluirInactivas: boolean): Promise<Marca[]>;

  /** Orden «al final»: el mayor existente + 1 (0 si no hay marcas). */
  siguienteOrden(): Promise<number>;

  /** Lanza `MarcaDuplicadaError` si la base rechaza el nombre repetido. */
  crear(marca: Marca): Promise<void>;

  /** Lanza `MarcaDuplicadaError` si la base rechaza el nombre repetido. */
  guardar(marca: Marca): Promise<void>;
}

export const MARCA_REPOSITORIO = Symbol('MARCA_REPOSITORIO');
