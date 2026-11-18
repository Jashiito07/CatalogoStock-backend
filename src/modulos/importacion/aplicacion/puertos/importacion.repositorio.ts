import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type {
  EstadoImportacion,
  Importacion,
} from '../../dominio/importacion.js';

/** La huella ya existe (violación de la restricción única al insertar). */
export class HuellaDuplicadaError extends Error {
  constructor() {
    super('Ya existe una importación con la misma huella.');
    this.name = 'HuellaDuplicadaError';
  }
}

export interface FiltroImportaciones {
  estado?: EstadoImportacion;
  marcaId?: string;
}

/** Puerto de persistencia de importaciones (tabla `importaciones_producto`). */
export interface ImportacionRepositorio {
  /** Falla con `HuellaDuplicadaError` si la huella ya existe. */
  insertar(importacion: Importacion): Promise<void>;

  buscarPorId(id: string): Promise<Importacion | null>;

  /**
   * Como `buscarPorId`, pero bloquea la fila hasta el fin de la transacción en
   * curso (`SELECT … FOR UPDATE`): serializa la eliminación (manual o por
   * retención) de la misma importación (D-57).
   */
  bloquearPorId(id: string): Promise<Importacion | null>;

  buscarPorHuella(huella: string): Promise<Importacion | null>;

  /**
   * Pasa a `ARCHIVADA` (con `archivadaEn = ahora`) las importaciones `VIGENTE`
   * de la marca. Serializa las subidas simultáneas de la misma marca para que
   * nunca haya dos vigentes (D-57). Devuelve cuántas archivó.
   */
  archivarVigentesDeMarca(marcaId: string, ahora: Date): Promise<number>;

  /** Más reciente primero (`fecha_creacion` descendente y luego id). */
  listar(
    filtro: FiltroImportaciones,
    paginacion: Paginacion,
  ): Promise<Pagina<Importacion>>;

  /** Todas las `ARCHIVADA` (a lo sumo unas pocas por marca y mes): candidatas de la retención. */
  listarArchivadas(): Promise<Importacion[]>;

  /** Borra la fila de la importación; `false` si ya no existía. Sus borradores se borran antes. */
  eliminar(id: string): Promise<boolean>;
}

export const IMPORTACION_REPOSITORIO = Symbol('IMPORTACION_REPOSITORIO');
