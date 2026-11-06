// API pública del módulo usuarios. Los demás módulos solo importan desde aquí.
export { UsuariosModule } from './usuarios.module.js';
export {
  CrearVendedorCasoUso,
  type DatosCrearVendedor,
  type ResultadoCrearVendedor,
} from './aplicacion/casos-uso/crear-vendedor.caso-uso.js';
export { ROLES, type Rol } from './dominio/rol.js';
export type { UsuarioPublico } from './dominio/usuario.js';
