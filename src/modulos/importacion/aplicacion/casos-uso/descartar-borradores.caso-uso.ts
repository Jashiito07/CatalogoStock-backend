import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';

export type ResultadoDescarte =
  | { id: string; estado: 'DESCARTADO' }
  | { id: string; error: 'NO_PENDIENTE' | 'NO_ENCONTRADO' };

export interface DatosDescartarBorradores {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  ids: readonly string[];
}

/**
 * `POST /productos/importaciones/borradores/descartar` (RF-PRO-01): marca
 * `DESCARTADO` los borradores `PENDIENTE` (un descartado no se reactiva ni se
 * puede aprobar después). Una transacción por borrador y `BORRADORES_DESCARTADOS`
 * por cada importación afectada.
 */
export class DescartarBorradoresCasoUso {
  constructor(
    private readonly borradores: BorradorRepositorio,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosDescartarBorradores): Promise<ResultadoDescarte[]> {
    const resultados: ResultadoDescarte[] = [];
    const descartadosPorImportacion = new Map<string, number>();
    for (const id of datos.ids) {
      const { resultado, idImportacion } = await this.descartarUno(id);
      resultados.push(resultado);
      if (idImportacion !== null) {
        descartadosPorImportacion.set(
          idImportacion,
          (descartadosPorImportacion.get(idImportacion) ?? 0) + 1,
        );
      }
    }
    for (const [idImportacion, cantidad] of descartadosPorImportacion) {
      await this.unidadTrabajo.ejecutar(() =>
        this.auditoria.registrar({
          accion: 'BORRADORES_DESCARTADOS',
          idUsuario: datos.idVendedor,
          entidad: 'IMPORTACION',
          idEntidad: idImportacion,
          detalle: { idImportacion, cantidad },
        }),
      );
    }
    return resultados;
  }

  private descartarUno(
    id: string,
  ): Promise<{ resultado: ResultadoDescarte; idImportacion: string | null }> {
    return this.unidadTrabajo.ejecutar(async () => {
      const borrador = await this.borradores.bloquearPorId(id);
      if (borrador === null) {
        return { resultado: { id, error: 'NO_ENCONTRADO' }, idImportacion: null };
      }
      if (!borrador.esPendiente) {
        return { resultado: { id, error: 'NO_PENDIENTE' }, idImportacion: null };
      }
      await this.borradores.guardar(borrador.descartar(this.reloj.ahora()));
      return {
        resultado: { id, estado: 'DESCARTADO' },
        idImportacion: borrador.idImportacion,
      };
    });
  }
}
