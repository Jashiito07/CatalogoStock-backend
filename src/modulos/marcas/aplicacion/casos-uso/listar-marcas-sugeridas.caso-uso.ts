import { claveDeNombreMarca } from '../../dominio/nombre-marca.js';
import {
  MARCAS_SUGERIDAS,
  type MarcaSugerida,
} from '../../dominio/marcas-sugeridas.js';
import type { MarcaRepositorio } from '../puertos/marca.repositorio.js';

export interface MarcaSugeridaConEstado extends MarcaSugerida {
  /** `true` si ya existe una marca con ese nombre (activa o inactiva). */
  yaCreada: boolean;
}

/** Lista fija de «Configura tu negocio» con `yaCreada` calculado (RF-PRO-06, D-48). */
export class ListarMarcasSugeridasCasoUso {
  constructor(private readonly marcas: MarcaRepositorio) {}

  async ejecutar(): Promise<MarcaSugeridaConEstado[]> {
    const existentes = await this.marcas.listar(true);
    const claves = new Set(existentes.map((marca) => marca.nombre.clave));
    return MARCAS_SUGERIDAS.map((sugerida) => ({
      ...sugerida,
      yaCreada: claves.has(claveDeNombreMarca(sugerida.nombre)),
    }));
  }
}
