import type { Paginacion } from '../../../../compartido/dominio/paginacion.js';
import type { FiltrosBitacora } from '../../dominio/filtros-bitacora.js';
import type { RegistroActividad } from '../../dominio/registro-actividad.js';

export interface ResultadoConsultaBitacora {
  registros: RegistroActividad[];
  total: number;
}

/**
 * Puerto de persistencia de la bitácora (tabla `auditoria`). Solo inserta y
 * consulta: los registros no se editan ni se borran (contrato de auditoría).
 */
export interface RegistroActividadRepositorio {
  /** Inserta el registro dentro de la transacción en curso, si la hay. */
  guardar(registro: RegistroActividad): Promise<void>;

  /**
   * Inserta el registro **fuera** de la transacción en curso, si la hay
   * (ingresos fallidos y accesos denegados).
   */
  guardarFueraDeTransaccion(registro: RegistroActividad): Promise<void>;

  /** Página de registros por `fecha` descendente (lo más reciente primero). */
  consultar(
    filtros: FiltrosBitacora,
    paginacion: Paginacion,
  ): Promise<ResultadoConsultaBitacora>;
}

export const REGISTRO_ACTIVIDAD_REPOSITORIO = Symbol(
  'REGISTRO_ACTIVIDAD_REPOSITORIO',
);
