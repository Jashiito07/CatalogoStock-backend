import { ImportacionNoEncontradaError } from '../../dominio/errores-importacion.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';
import type { VistaImportacion } from '../vista-importacion.js';

/** `GET /productos/importaciones/{id}`: la importación con sus totales (404 si no existe). */
export class ObtenerImportacionCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly borradores: BorradorRepositorio,
    private readonly marcas: DirectorioMarcas,
  ) {}

  async ejecutar(id: string): Promise<VistaImportacion> {
    const importacion = await this.importaciones.buscarPorId(id);
    if (importacion === null) {
      throw new ImportacionNoEncontradaError();
    }
    const marca = await this.marcas.buscarPorId(importacion.marcaId);
    if (marca === null) {
      // La clave foránea lo impide: es un fallo de integridad, no un 404.
      throw new Error('Una importación apunta a una marca que no existe.');
    }
    return {
      importacion,
      marca,
      totales: await this.borradores.totales(importacion.id),
    };
  }
}
