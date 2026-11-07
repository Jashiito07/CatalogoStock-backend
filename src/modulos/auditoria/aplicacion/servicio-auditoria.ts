import type {
  AccionAuditoria,
  EntidadAuditoria,
} from '../dominio/catalogo-auditoria.js';

/**
 * API interna de la bitácora para los demás módulos del backend (contrato de
 * auditoría, «API interna»). No es HTTP. Ningún módulo escribe directamente
 * en la tabla `auditoria`.
 */
export interface RegistrarActividad {
  /** Valor del catálogo. */
  accion: AccionAuditoria;
  /** Quién hizo la acción; `null` si no se pudo identificar. */
  idUsuario: string | null;
  entidad: EntidadAuditoria | null;
  idEntidad: string | null;
  /** Sin datos sensibles: la salvaguarda del dominio elimina lo prohibido. */
  detalle?: Record<string, string | number | boolean | null>;
}

export interface ServicioAuditoria {
  /**
   * Registra la actividad. Si la operación auditada modifica datos, se llama
   * **dentro de la misma transacción** (`UnidadDeTrabajo`): si cualquiera de
   * las dos falla, no queda ninguna (CA-03). Los errores se propagan.
   */
  registrar(actividad: RegistrarActividad): Promise<void>;

  /**
   * Para rechazos e ingresos fallidos, que no modifican datos (CA-02): se
   * registra **fuera** de cualquier transacción y nunca falla. Si la bitácora
   * no está disponible, se avisa en el log técnico (sin datos personales) y
   * la respuesta al usuario no cambia.
   */
  registrarSinInterrumpir(actividad: RegistrarActividad): Promise<void>;
}

export const SERVICIO_AUDITORIA = Symbol('SERVICIO_AUDITORIA');
