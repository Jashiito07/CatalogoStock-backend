import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import {
  ImportacionArchivadaError,
  ImportacionNoEncontradaError,
} from '../../dominio/errores-importacion.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';
import type {
  ProductoAusente,
  ProductosExistentes,
} from '../puertos/productos-existentes.puerto.js';

/**
 * `GET /productos/importaciones/{id}/ausentes` (D-57): productos de la marca
 * con código, no eliminados, cuyo código no aparece en los borradores de la
 * importación vigente. **Solo informativo**: no cambia ningún producto. 404 si
 * la importación no existe; 422 `IMPORTACION_ARCHIVADA` si está archivada.
 */
export class ListarAusentesCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly borradores: BorradorRepositorio,
    private readonly productos: ProductosExistentes,
  ) {}

  async ejecutar(
    idImportacion: string,
    paginacion: Paginacion,
  ): Promise<Pagina<ProductoAusente>> {
    const importacion = await this.importaciones.buscarPorId(idImportacion);
    if (importacion === null) {
      throw new ImportacionNoEncontradaError();
    }
    if (importacion.estaArchivada) {
      throw new ImportacionArchivadaError();
    }
    const codigos = await this.borradores.codigosDeImportacion(importacion.id);
    return this.productos.listarAusentes(importacion.marcaId, codigos, paginacion);
  }
}
