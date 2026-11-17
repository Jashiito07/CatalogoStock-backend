// API pública del módulo productos (RF-PRO-01 a RF-PRO-05). Los demás módulos
// (imágenes en 2.4, carrito, pedidos e inventario después) solo importan desde
// aquí y usan `ProductosServicio`; ninguno accede a la tabla `productos`.
export { ProductosModule } from './productos.module.js';
export { ProductosServicio } from './aplicacion/productos.servicio.js';
export type { DatosCrearProducto } from './aplicacion/casos-uso/crear-producto.caso-uso.js';
export type { ProductoPublico } from './dominio/producto.js';
// Validaciones puras (sin NestJS), para el dominio de otros módulos: se importan
// desde `productos/validaciones.js` (ver ese archivo).
export type { Disponibilidad } from './dominio/disponibilidad.js';
