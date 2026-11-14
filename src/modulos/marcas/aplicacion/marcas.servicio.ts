import type { MarcaPublica } from '../dominio/marca.js';
import type { MarcaRepositorio } from './puertos/marca.repositorio.js';

/**
 * Servicio público del módulo `marcas` para los demás módulos del backend
 * (por ejemplo `productos`, subfase 2.3). Ningún otro módulo accede a la
 * tabla `marcas`.
 */
export class MarcasServicio {
  constructor(private readonly marcas: MarcaRepositorio) {}

  /** La marca (activa o inactiva) o `null` si no existe. */
  async buscarPorId(id: string): Promise<MarcaPublica | null> {
    const marca = await this.marcas.buscarPorId(id);
    return marca === null ? null : marca.aPublica();
  }

  /** Las marcas que existen entre los ids dados, sin orden garantizado. */
  async buscarPorIds(ids: readonly string[]): Promise<MarcaPublica[]> {
    const marcas = await this.marcas.buscarPorIds(ids);
    return marcas.map((marca) => marca.aPublica());
  }
}
