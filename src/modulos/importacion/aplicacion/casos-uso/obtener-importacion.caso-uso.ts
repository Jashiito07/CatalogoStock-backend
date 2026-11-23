import { ImportacionNoEncontradaError } from '../../dominio/errores-importacion.js';
import type { CalculadorTotalesImportacion } from '../calculador-totales.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';
import type { VistaImportacion } from '../vista-importacion.js';

/** `GET /productos/importaciones/{id}`: la importación con sus totales (404 si no existe o es de otro Vendedor, D-60). */
export class ObtenerImportacionCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly totales: CalculadorTotalesImportacion,
    private readonly marcas: DirectorioMarcas,
  ) {}

  async ejecutar(id: string, idVendedor: string): Promise<VistaImportacion> {
    const importacion = await this.importaciones.buscarPorId(id);
    // D-60: la de otro Vendedor responde 404, igual que una que no existe.
    if (importacion === null || !importacion.perteneceA(idVendedor)) {
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
      totales: await this.totales.calcular(importacion),
    };
  }
}
