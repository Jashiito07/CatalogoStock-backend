// API pública del módulo auditoria (RF-USU-04). Los demás módulos solo
// importan desde aquí y registran actividades con `SERVICIO_AUDITORIA`;
// ninguno escribe en la tabla `auditoria`.
//
// La consulta HTTP (`GET /auditoria`) vive en `ConsultaBitacoraModule`
// (`consulta-bitacora.module.ts`), que AppModule importa directamente: ese
// módulo depende de `usuarios`, y exportarlo aquí crearía un ciclo de
// importaciones con `usuarios`, que sí depende de esta API.
export { AuditoriaModule } from './auditoria.module.js';
export {
  type RegistrarActividad,
  SERVICIO_AUDITORIA,
  type ServicioAuditoria,
} from './aplicacion/servicio-auditoria.js';
export {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
  ENTIDADES_AUDITORIA,
  type EntidadAuditoria,
} from './dominio/catalogo-auditoria.js';
