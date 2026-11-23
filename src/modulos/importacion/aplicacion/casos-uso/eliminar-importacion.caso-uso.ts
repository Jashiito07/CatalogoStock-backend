import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { ImportacionNoEncontradaError } from '../../dominio/errores-importacion.js';
import { eliminarImportacion } from '../eliminar-importacion.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';

export interface DatosEliminarImportacion {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idImportacion: string;
}

/**
 * `DELETE /productos/importaciones/{id}` (D-57): elimina la importación (en
 * cualquier estado) y sus borradores; **nunca** los productos ya creados ni
 * sus precios. Libera la huella: el mismo PDF puede subirse otra vez. 404 si
 * no existe (también ante dos eliminaciones simultáneas: gana la primera).
 * `IMPORTACION_ELIMINADA` con `motivo: MANUAL` en la misma transacción.
 */
export class EliminarImportacionCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly borradores: BorradorRepositorio,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosEliminarImportacion): Promise<void> {
    await this.unidadTrabajo.ejecutar(async () => {
      const importacion = await this.importaciones.bloquearPorId(
        datos.idImportacion,
      );
      // D-60: la de otro Vendedor responde 404 y no se toca.
      if (importacion === null || !importacion.perteneceA(datos.idVendedor)) {
        throw new ImportacionNoEncontradaError();
      }
      const eliminada = await eliminarImportacion(
        {
          importaciones: this.importaciones,
          borradores: this.borradores,
          auditoria: this.auditoria,
        },
        importacion,
        'MANUAL',
        datos.idVendedor,
      );
      if (!eliminada) {
        throw new ImportacionNoEncontradaError();
      }
    });
  }
}
