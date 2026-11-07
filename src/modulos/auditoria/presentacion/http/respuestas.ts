import type { Pagina } from '../../../../compartido/dominio/paginacion.js';
import type {
  ActividadConsultada,
  UsuarioDeActividad,
} from '../../aplicacion/casos-uso/consultar-bitacora.caso-uso.js';
import type {
  AccionAuditoria,
  EntidadAuditoria,
} from '../../dominio/catalogo-auditoria.js';
import type { DetalleAuditoria } from '../../dominio/detalle-auditoria.js';

/** «Registro de actividad» del contrato de auditoría. */
export interface RespuestaActividad {
  id: string;
  fecha: string;
  accion: AccionAuditoria;
  usuario: UsuarioDeActividad | null;
  entidad: EntidadAuditoria | null;
  idEntidad: string | null;
  detalle: DetalleAuditoria;
}

/** Formato de paginación del contrato (README). */
export interface RespuestaPaginaBitacora {
  elementos: RespuestaActividad[];
  pagina: number;
  tamanio: number;
  total: number;
}

export function aRespuestaPaginaBitacora(
  pagina: Pagina<ActividadConsultada>,
): RespuestaPaginaBitacora {
  return {
    elementos: pagina.elementos.map((actividad) => ({
      id: actividad.id,
      fecha: actividad.fecha.toISOString(),
      accion: actividad.accion,
      usuario: actividad.usuario,
      entidad: actividad.entidad,
      idEntidad: actividad.idEntidad,
      detalle: actividad.detalle,
    })),
    pagina: pagina.pagina,
    tamanio: pagina.tamanio,
    total: pagina.total,
  };
}
