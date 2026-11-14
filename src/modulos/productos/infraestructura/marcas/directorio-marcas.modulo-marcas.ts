import type { MarcaPublica, MarcasServicio } from '../../../marcas/index.js';
import type { DirectorioMarcas } from '../../aplicacion/puertos/directorio-marcas.puerto.js';

/**
 * Adaptador del puerto DirectorioMarcas con el servicio público del módulo
 * `marcas` (productos nunca lee la tabla `marcas`).
 */
export class DirectorioMarcasModuloMarcas implements DirectorioMarcas {
  constructor(private readonly marcas: MarcasServicio) {}

  buscarPorId(id: string): Promise<MarcaPublica | null> {
    return this.marcas.buscarPorId(id);
  }

  buscarPorIds(ids: readonly string[]): Promise<MarcaPublica[]> {
    return this.marcas.buscarPorIds(ids);
  }

  listarActivas(): Promise<MarcaPublica[]> {
    return this.marcas.listar(false);
  }
}
