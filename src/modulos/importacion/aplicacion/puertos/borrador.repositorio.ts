import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { Borrador, EstadoBorrador } from '../../dominio/borrador.js';
import type { TotalesImportacion } from '../../dominio/importacion.js';

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

  totales(idImportacion: string): Promise<TotalesImportacion>;

  /** Entre `codigos`, los que ya tienen un borrador `APROBADO` (de cualquier importación). */
  codigosAprobados(codigos: readonly string[]): Promise<Set<string>>;
}

export const BORRADOR_REPOSITORIO = Symbol('BORRADOR_REPOSITORIO');
