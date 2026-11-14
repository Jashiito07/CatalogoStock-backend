// API pública del módulo marcas (RF-PRO-04). Los demás módulos (productos, 2.3)
// solo importan desde aquí y usan `MarcasServicio`; ninguno accede a la tabla.
export { MarcasModule } from './marcas.module.js';
export { MarcasServicio } from './aplicacion/marcas.servicio.js';
export type { MarcaPublica } from './dominio/marca.js';
export type { ColorTexto } from './dominio/color.js';
