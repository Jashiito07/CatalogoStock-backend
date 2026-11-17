import type { Importacion } from '../../dominio/importacion.js';

/** La huella ya existe (violación de la restricción única al insertar). */
export class HuellaDuplicadaError extends Error {
  constructor() {
    super('Ya existe una importación con la misma huella.');
    this.name = 'HuellaDuplicadaError';
  }
}

/** Puerto de persistencia de importaciones (tabla `importaciones_producto`). */
export interface ImportacionRepositorio {
  /** Falla con `HuellaDuplicadaError` si la huella ya existe. */
  insertar(importacion: Importacion): Promise<void>;

  buscarPorId(id: string): Promise<Importacion | null>;

  buscarPorHuella(huella: string): Promise<Importacion | null>;
}

export const IMPORTACION_REPOSITORIO = Symbol('IMPORTACION_REPOSITORIO');
