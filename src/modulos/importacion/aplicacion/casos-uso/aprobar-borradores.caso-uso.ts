import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { ErrorDominio } from '../../../../compartido/dominio/errores.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { CreadorProductos } from '../puertos/creador-productos.puerto.js';

export type ErrorResultadoBorrador =
  | 'SIN_PRECIO'
  | 'MARCA_INACTIVA'
  | 'NO_PENDIENTE'
  | 'NO_ENCONTRADO'
  /** El producto no pasó una validación del alta (no debería ocurrir con datos ya validados). */
  | 'DATOS_INVALIDOS';

export type ResultadoAprobacion =
  | { id: string; estado: 'APROBADO'; idProducto: string }
  | { id: string; error: ErrorResultadoBorrador };

export interface DatosAprobarBorradores {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  ids: readonly string[];
}

/**
 * `POST /productos/importaciones/borradores/aprobar` (RF-PRO-01, RN-11).
 * Crea un producto por cada borrador `PENDIENTE` aprobable con las mismas
 * validaciones y la misma bitácora (`PRODUCTO_CREADO`) que `POST /productos`,
 * **en una transacción por borrador**: un fallo no deshace los demás. El
 * borrador se bloquea (`FOR UPDATE`), así que aprobar dos veces, aun en
 * paralelo, crea un solo producto y la segunda responde `NO_PENDIENTE`. Al
 * terminar registra `BORRADORES_APROBADOS` por cada importación afectada.
 */
export class AprobarBorradoresCasoUso {
  constructor(
    private readonly borradores: BorradorRepositorio,
    private readonly productos: CreadorProductos,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(
    datos: DatosAprobarBorradores,
  ): Promise<ResultadoAprobacion[]> {
    const resultados: ResultadoAprobacion[] = [];
    const aprobadosPorImportacion = new Map<string, number>();
    for (const id of datos.ids) {
      const { resultado, idImportacion } = await this.aprobarUno(
        id,
        datos.idVendedor,
      );
      resultados.push(resultado);
      if (idImportacion !== null) {
        aprobadosPorImportacion.set(
          idImportacion,
          (aprobadosPorImportacion.get(idImportacion) ?? 0) + 1,
        );
      }
    }
    for (const [idImportacion, cantidad] of aprobadosPorImportacion) {
      await this.unidadTrabajo.ejecutar(() =>
        this.auditoria.registrar({
          accion: 'BORRADORES_APROBADOS',
          idUsuario: datos.idVendedor,
          entidad: 'IMPORTACION',
          idEntidad: idImportacion,
          detalle: { idImportacion, cantidad },
        }),
      );
    }
    return resultados;
  }

  private async aprobarUno(
    id: string,
    idVendedor: string,
  ): Promise<{ resultado: ResultadoAprobacion; idImportacion: string | null }> {
    const fallo = (error: ErrorResultadoBorrador) => ({
      resultado: { id, error } satisfies ResultadoAprobacion,
      idImportacion: null,
    });
    try {
      return await this.unidadTrabajo.ejecutar(async () => {
        const borrador = await this.borradores.bloquearPorId(id);
        if (borrador === null) {
          return fallo('NO_ENCONTRADO');
        }
        if (!borrador.esPendiente) {
          return fallo('NO_PENDIENTE');
        }
        if (borrador.precio === null) {
          return fallo('SIN_PRECIO');
        }
        const idProducto = await this.productos.crear({
          idVendedor,
          nombre: borrador.nombre,
          marcaId: borrador.marcaId,
          precio: borrador.precio.aTexto(),
          descripcion: borrador.descripcionParaProducto(),
          disponibilidad: borrador.disponibilidad,
        });
        await this.borradores.guardar(
          borrador.aprobar(idProducto, this.reloj.ahora()),
        );
        return {
          resultado: {
            id,
            estado: 'APROBADO',
            idProducto,
          } satisfies ResultadoAprobacion,
          idImportacion: borrador.idImportacion,
        };
      });
    } catch (error) {
      // La transacción de este borrador ya se deshizo; los demás no se tocan.
      if (error instanceof ErrorDominio) {
        if (error.codigo === 'MARCA_INACTIVA') {
          return fallo('MARCA_INACTIVA');
        }
        if (
          error.codigo === 'DATOS_INVALIDOS' ||
          error.codigo === 'NO_ENCONTRADO'
        ) {
          return fallo('DATOS_INVALIDOS');
        }
      }
      throw error;
    }
  }
}
