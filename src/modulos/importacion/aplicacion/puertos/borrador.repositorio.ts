import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { Borrador, EstadoBorrador } from '../../dominio/borrador.js';
import type { TotalesBorradores } from '../../dominio/importacion.js';

export interface FiltroBorradores {
  idImportacion: string;
  estado: EstadoBorrador;
  /** `true`: solo con advertencias que piden revisión; `false`: solo sin ellas. */
  conAdvertencias?: boolean;
  /** Clave sin tildes ni mayúsculas, sobre el nombre y el código. */
  clave?: string;
  /** Solo los de esa página del PDF. */
  paginaPdf?: number;
}

/** Cuántos borradores pendientes hay con una marca y un código. */
export interface PendientesPorCodigo {
  marcaId: string;
  codigo: string;
  cantidad: number;
}

/** Un borrador pendiente sin código (D-57). */
export interface PendienteSinCodigo {
  marcaId: string;
  nombre: string;
  nombreDudoso: boolean;
}

/** Puerto de persistencia de borradores (tabla `borradores_producto`). */
export interface BorradorRepositorio {
  insertarVarios(borradores: readonly Borrador[]): Promise<void>;

  buscarPorId(id: string): Promise<Borrador | null>;

  /**
   * Como `buscarPorId`, pero bloquea la fila hasta el fin de la transacción en
   * curso (`SELECT . FOR UPDATE`): dos aprobaciones simultáneas del mismo
   * borrador se serializan y la segunda lo ve ya aprobado.
   */
  bloquearPorId(id: string): Promise<Borrador | null>;

  /** `false` si el borrador ya no existe. */
  guardar(borrador: Borrador): Promise<boolean>;

  /** Orden: página del PDF, posición y id. */
  listar(
    filtro: FiltroBorradores,
    paginacion: Paginacion,
  ): Promise<Pagina<Borrador>>;

  /** Como `listar`, sin paginar (mismo orden): para el filtro `accion`, que depende de los productos publicados (D-57). */
  listarTodos(filtro: FiltroBorradores): Promise<Borrador[]>;

  totales(idImportacion: string): Promise<TotalesBorradores>;

  /** Pendientes **con código**, agrupados por marca y código (D-57: `actualizaran` y `nuevos`). */
  pendientesPorCodigo(idImportacion: string): Promise<PendientesPorCodigo[]>;

  /**
   * Pendientes **sin código** (D-57: emparejado por nombre): marca, nombre y si
   * llevan `NOMBRE_DUDOSO` (esos no se emparejan).
   */
  pendientesSinCodigo(idImportacion: string): Promise<PendienteSinCodigo[]>;

  /** Códigos distintos de **todos** los borradores de la importación, cualquiera sea su estado (D-57: `ausentes`). */
  codigosDeImportacion(idImportacion: string): Promise<string[]>;

  /** Borra los borradores de una importación; devuelve cuántos (D-57). */
  eliminarDeImportacion(idImportacion: string): Promise<number>;
}

export const BORRADOR_REPOSITORIO = Symbol('BORRADOR_REPOSITORIO');
