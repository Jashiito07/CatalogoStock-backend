import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { BorradorPublico, EstadoBorrador } from '../../dominio/borrador.js';
import { ImportacionNoEncontradaError } from '../../dominio/errores-importacion.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';

export interface ConsultaBorradores {
  idImportacion: string;
  /** Por defecto `PENDIENTE`. */
  estado?: EstadoBorrador;
  conAdvertencias?: boolean;
  /** Ya convertida a clave sin tildes ni mayúsculas. */
  clave?: string;
  paginaPdf?: number;
  paginacion: Paginacion;
}

/**
 * `GET /productos/importaciones/{id}/borradores` (RF-PRO-01): lista paginada
 * por página del PDF y posición, con filtros de estado, advertencias, texto y
 * página del PDF. 404 si la importación no existe.
 */
export class ListarBorradoresCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly borradores: BorradorRepositorio,
  ) {}

  async ejecutar(consulta: ConsultaBorradores): Promise<Pagina<BorradorPublico>> {
    const importacion = await this.importaciones.buscarPorId(
      consulta.idImportacion,
    );
    if (importacion === null) {
      throw new ImportacionNoEncontradaError();
    }
    const pagina = await this.borradores.listar(
      {
        idImportacion: importacion.id,
        estado: consulta.estado ?? 'PENDIENTE',
        conAdvertencias: consulta.conAdvertencias,
        clave: consulta.clave,
        paginaPdf: consulta.paginaPdf,
      },
      consulta.paginacion,
    );
    return {
      ...pagina,
      elementos: pagina.elementos.map((borrador) => borrador.aPublico()),
    };
  }
}
