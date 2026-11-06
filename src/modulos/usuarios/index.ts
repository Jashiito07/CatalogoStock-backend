// API pública del módulo usuarios. Los demás módulos solo importan desde aquí.
export { UsuariosModule } from './usuarios.module.js';
export {
  CrearVendedorCasoUso,
  type DatosCrearVendedor,
  type ResultadoCrearVendedor,
} from './aplicacion/casos-uso/crear-vendedor.caso-uso.js';
export { ROLES, type Rol } from './dominio/rol.js';
export { CANALES, type Canal } from './dominio/canal.js';
// Para el guard global de autenticación de la subfase 1.4.
export {
  EMISOR_TOKEN_ACCESO,
  type EmisorTokenAcceso,
  type IdentidadTokenAcceso,
} from './aplicacion/puertos/emisor-token-acceso.puerto.js';
export {
  GuardTokenAcceso,
  UsuarioAutenticado,
  type SolicitudAutenticada,
} from './presentacion/http/guard-token-acceso.js';
export type { UsuarioPublico } from './dominio/usuario.js';
