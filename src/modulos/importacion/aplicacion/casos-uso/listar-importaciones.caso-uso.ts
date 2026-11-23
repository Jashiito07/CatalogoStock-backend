import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { EstadoImportacion } from '../../dominio/importacion.js';
import type { CalculadorTotalesImportacion } from '../calculador-totales.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';
import type { VistaImportacion } from '../vista-importacion.js';

export interface ConsultaImportaciones {
  /** Vendedor del token: solo ve sus importaciones (D-60). */
  idVendedor: string;
  estado?: EstadoImportacion;
  marcaId?: string;
  paginacion: Paginacion;
}

/**
 * `GET /productos/importaciones` (D-57): lista paginada de importaciones, la
 * más reciente primero, con filtros `estado` y `marcaId`. Cada elemento es una
 * Importación con sus totales. Solo lectura.
 */
export class ListarImportacionesCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly totales: CalculadorTotalesImportacion,
    private readonly marcas: DirectorioMarcas,
  ) {}

  async ejecutar(
    consulta: ConsultaImportaciones,
  ): Promise<Pagina<VistaImportacion>> {
    const pagina = await this.importaciones.listar(
      {
        idVendedor: consulta.idVendedor,
        estado: consulta.estado,
        marcaId: consulta.marcaId,
      },
      consulta.paginacion,
    );
    const ids = [...new Set(pagina.elementos.map((i) => i.marcaId))];
    const marcas = new Map(
      (ids.length === 0 ? [] : await this.marcas.buscarPorIds(ids)).map(
        (marca) => [marca.id, marca],
      ),
    );
    const elementos: VistaImportacion[] = [];
    for (const importacion of pagina.elementos) {
      const marca = marcas.get(importacion.marcaId);
      if (marca === undefined) {
        // La clave foránea lo impide: es un fallo de integridad, no un 404.
        throw new Error('Una importación apunta a una marca que no existe.');
      }
      elementos.push({
        importacion,
        marca,
        totales: await this.totales.calcular(importacion),
      });
    }
    return { ...pagina, elementos };
  }
}
