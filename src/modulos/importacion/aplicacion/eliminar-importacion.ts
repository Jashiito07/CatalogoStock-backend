import type { ServicioAuditoria } from '../../auditoria/index.js';
import type { Importacion } from '../dominio/importacion.js';
import type { BorradorRepositorio } from './puertos/borrador.repositorio.js';
import type { ImportacionRepositorio } from './puertos/importacion.repositorio.js';

/** Por qué se eliminó una importación (bitácora `IMPORTACION_ELIMINADA`, D-57). */
export type MotivoEliminacion = 'MANUAL' | 'RETENCION';

/**
 * Elimina una importación y sus borradores y deja la bitácora
 * `IMPORTACION_ELIMINADA` (`idImportacion`, `motivo`, `borradores`; sin nombre
 * de archivo ni contenido, D-20). **Nunca toca productos**: los borradores
 * aprobados solo guardan una referencia al producto, que no se borra (D-57).
 * Se llama dentro de una unidad de trabajo, con la fila de la importación ya
 * bloqueada (`bloquearPorId`). Devuelve `false` si la fila ya no existía.
 */
export async function eliminarImportacion(
  dependencias: {
    importaciones: ImportacionRepositorio;
    borradores: BorradorRepositorio;
    auditoria: ServicioAuditoria;
  },
  importacion: Importacion,
  motivo: MotivoEliminacion,
  idUsuario: string | null,
): Promise<boolean> {
  const borradores = await dependencias.borradores.eliminarDeImportacion(
    importacion.id,
  );
  if (!(await dependencias.importaciones.eliminar(importacion.id))) {
    return false;
  }
  await dependencias.auditoria.registrar({
    accion: 'IMPORTACION_ELIMINADA',
    idUsuario,
    entidad: 'IMPORTACION',
    idEntidad: importacion.id,
    detalle: { idImportacion: importacion.id, motivo, borradores },
  });
  return true;
}
