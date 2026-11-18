// Validaciones puras de un producto, parte de la API pública del módulo
// `productos`: otros módulos (importación del catálogo, 2.8) las reutilizan
// para aplicar exactamente las mismas reglas que `POST /productos` sin copiar
// código. Solo TypeScript puro: no importan NestJS ni TypeORM.
export {
  MENSAJE_CODIGO_INVALIDO,
  MENSAJE_DESCRIPCION_INVALIDA,
  MENSAJE_MARCA_ID_INVALIDO,
  MENSAJE_NOMBRE_INVALIDO,
  MENSAJE_PRECIO_INVALIDO,
  validarCodigo,
  validarDescripcion,
  validarMarcaId,
  validarNombreProducto,
  validarPrecio,
} from './dominio/producto.js';
export {
  DISPONIBILIDADES,
  type Disponibilidad,
  MENSAJE_DISPONIBILIDAD_INVALIDA,
  validarDisponibilidad,
} from './dominio/disponibilidad.js';
export {
  claveDeBusqueda,
  claveDeEmparejamiento,
  MENSAJE_BUSQUEDA_INVALIDA,
  validarBusqueda,
} from './dominio/busqueda.js';
