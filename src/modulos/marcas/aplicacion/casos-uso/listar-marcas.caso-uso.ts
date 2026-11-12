import type { ActorAutenticado } from '../../../usuarios/index.js';
import type { MarcaPublica } from '../../dominio/marca.js';
import type { MarcaRepositorio } from '../puertos/marca.repositorio.js';

/**
 * Lista las marcas (RF-PRO-04, RF-CAT-05) ordenadas por `orden` y nombre.
 * `incluirInactivas` solo lo respeta el Vendedor: el Cliente siempre recibe
 * solo las activas (una marca inactiva no se muestra al Cliente).
 */
export class ListarMarcasCasoUso {
  constructor(private readonly marcas: MarcaRepositorio) {}

  async ejecutar(
    actor: ActorAutenticado,
    incluirInactivas: boolean,
  ): Promise<MarcaPublica[]> {
    const todas = incluirInactivas && actor.rol === 'VENDEDOR';
    const marcas = await this.marcas.listar(todas);
    return marcas.map((marca) => marca.aPublica());
  }
}
