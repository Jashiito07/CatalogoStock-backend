// API pública del módulo usuarios. Los demás módulos solo importan desde aquí.
export { UsuariosModule } from './usuarios.module.js';
export {
  CrearVendedorCasoUso,
  type DatosCrearVendedor,
  type ResultadoCrearVendedor,
} from './aplicacion/casos-uso/crear-vendedor.caso-uso.js';
export {
  RestablecerClaveVendedorCasoUso,
  type ResultadoRestablecerClaveVendedor,
} from './aplicacion/casos-uso/restablecer-clave-vendedor.caso-uso.js';
export {
  ConsultarResumenesUsuariosCasoUso,
  type ResumenUsuario,
} from './aplicacion/casos-uso/consultar-resumenes-usuarios.caso-uso.js';
// Envío de correo (contrato de correo, D-50): las pruebas sustituyen
// ENVIADOR_CORREO por un transporte falso en memoria.
export {
  ENVIADOR_CORREO,
  type EnviadorCorreo,
  type MensajeCorreo,
} from './aplicacion/puertos/enviador-correo.puerto.js';
export { CorreoNoDisponibleError } from './dominio/errores-correo.js';
export { ROLES, type Rol } from './dominio/rol.js';
export { CANALES, type Canal } from './dominio/canal.js';
export type { UsuarioPublico } from './dominio/usuario.js';

// Autorización (subfase 1.4, RF-USU-03, CA-02). Los controladores de los demás
// módulos usan `@Roles(...)` y `@UsuarioActual()`; los casos de uso, la regla
// de propiedad. `@Publico()` vive en `compartido/presentacion/publico.ts`.
export {
  type ActorAutenticado,
  type AlcanceConsulta,
  alcanceDeConsulta,
  exigirAccesoARecurso,
  MENSAJE_RECURSO_NO_ENCONTRADO,
  puedeAccederARecurso,
} from './dominio/propiedad.js';
export { GuardRoles, Roles } from './presentacion/http/roles.js';
export { UsuarioActual } from './presentacion/http/usuario-actual.js';
export {
  GuardTokenAcceso,
  type SolicitudAutenticada,
} from './presentacion/http/guard-token-acceso.js';
export {
  EMISOR_TOKEN_ACCESO,
  type EmisorTokenAcceso,
  type IdentidadTokenAcceso,
} from './aplicacion/puertos/emisor-token-acceso.puerto.js';
