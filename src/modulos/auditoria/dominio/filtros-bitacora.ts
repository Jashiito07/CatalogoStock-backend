import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import type {
  AccionAuditoria,
  EntidadAuditoria,
} from './catalogo-auditoria.js';

/** Filtros de `GET /auditoria` (contrato de auditoría). Todos opcionales. */
export interface FiltrosBitacora {
  readonly accion?: AccionAuditoria;
  readonly idUsuario?: string;
  readonly entidad?: EntidadAuditoria;
  readonly idEntidad?: string;
  /** Inclusive. */
  readonly desde?: Date;
  /** Inclusive; debe ser ≥ `desde`. */
  readonly hasta?: Date;
}

export const MENSAJE_RANGO_FECHAS =
  'La fecha «hasta» debe ser igual o posterior a la fecha «desde».';

/**
 * Contrato: `hasta` < `desde` → 400 `DATOS_INVALIDOS`, con el mismo formato
 * de `detalles.errores` que el ValidationPipe.
 */
export function validarFiltrosBitacora(
  filtros: FiltrosBitacora,
): FiltrosBitacora {
  const { desde, hasta } = filtros;
  if (desde && hasta && hasta.getTime() < desde.getTime()) {
    throw new DatosInvalidosError('Los datos enviados no son válidos.', {
      errores: [{ campo: 'hasta', errores: [MENSAJE_RANGO_FECHAS] }],
    });
  }
  return filtros;
}
