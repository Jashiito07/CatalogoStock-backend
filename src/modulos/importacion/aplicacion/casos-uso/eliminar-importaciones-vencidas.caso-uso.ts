import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import type { Importacion } from '../../dominio/importacion.js';
import { eliminarImportacion } from '../eliminar-importacion.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';

/** Cuántas importaciones se procesan por tanda (cada una en su propia transacción). */
export const TAMANIO_LOTE_RETENCION = 20;

export interface ResultadoRetencion {
  /** Importaciones que esta ejecución eliminó. */
  eliminadas: number;
  /** Importaciones que fallaron (se reintentan en la próxima ejecución). */
  fallidas: number;
}

/**
 * Retención automática (D-57): elimina las importaciones `ARCHIVADA` a las que
 * ya pasaron **6 meses calendario desde `archivadaEn`** (regla en el dominio:
 * `Importacion.estaVencida`), con sus borradores y nunca sus productos. Una
 * `VIGENTE` jamás se elimina sola.
 *
 * Es idempotente y segura con varias ejecuciones o instancias a la vez: cada
 * importación se elimina en su propia transacción, con su fila bloqueada
 * (`FOR UPDATE`); la segunda ejecución la encuentra ya eliminada y no hace ni
 * registra nada. Los lotes son pequeños (`TAMANIO_LOTE_RETENCION`).
 * `IMPORTACION_ELIMINADA` con `motivo: RETENCION` y usuario nulo (sin nombre
 * de archivo ni contenido, D-20). Lo invoca el planificador interno del
 * servidor al arrancar y cada 24 horas.
 */
export class EliminarImportacionesVencidasCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly borradores: BorradorRepositorio,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(): Promise<ResultadoRetencion> {
    const ahora = this.reloj.ahora();
    const vencidas = (await this.importaciones.listarArchivadas()).filter(
      (importacion) => importacion.estaVencida(ahora),
    );
    const resultado: ResultadoRetencion = { eliminadas: 0, fallidas: 0 };
    for (let i = 0; i < vencidas.length; i += TAMANIO_LOTE_RETENCION) {
      for (const importacion of vencidas.slice(i, i + TAMANIO_LOTE_RETENCION)) {
        try {
          if (await this.eliminarUna(importacion, ahora)) {
            resultado.eliminadas++;
          }
        } catch {
          // Una importación con problemas no frena a las demás; se reintenta mañana.
          resultado.fallidas++;
        }
      }
    }
    return resultado;
  }

  private eliminarUna(candidata: Importacion, ahora: Date): Promise<boolean> {
    return this.unidadTrabajo.ejecutar(async () => {
      const importacion = await this.importaciones.bloquearPorId(candidata.id);
      // Otra ejecución (u otra instancia) ya la eliminó, o dejó de estar vencida.
      if (importacion === null || !importacion.estaVencida(ahora)) {
        return false;
      }
      return eliminarImportacion(
        {
          importaciones: this.importaciones,
          borradores: this.borradores,
          auditoria: this.auditoria,
        },
        importacion,
        'RETENCION',
        null,
      );
    });
  }
}
