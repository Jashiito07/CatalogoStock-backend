import type { MarcaPublica } from '../../../marcas/index.js';

/**
 * Puerto con lo que `productos` necesita de `marcas`. El adaptador usa el
 * servicio público de ese módulo: `productos` nunca lee la tabla `marcas`.
 */
export interface DirectorioMarcas {
  /** La marca (activa o inactiva) o `null` si no existe. */
  buscarPorId(id: string): Promise<MarcaPublica | null>;

  /** Las marcas que existen entre los ids dados. */
  buscarPorIds(ids: readonly string[]): Promise<MarcaPublica[]>;

  /** Las marcas activas (las únicas que ve el Cliente). */
  listarActivas(): Promise<MarcaPublica[]>;
}

export const DIRECTORIO_MARCAS = Symbol('DIRECTORIO_MARCAS');
