import type { Pagina } from '../../../../compartido/dominio/paginacion.js';
import type { VistaProducto } from '../../aplicacion/vista-producto.js';

/** Imagen del contrato; la subfase 2.4 las llena (`imagenes: []` por ahora). */
export interface RespuestaImagen {
  id: string;
  url: string;
  orden: number;
  principal: boolean;
}

/** Resumen de marca dentro de un Producto (contrato, «Modelo → Producto»). */
export interface RespuestaMarcaResumen {
  id: string;
  nombre: string;
  color: string;
  colorAcento: string | null;
  textoSobreColor: string;
  textoSobreAcento: string | null;
}

/** Producto del contrato de productos (el precio viaja como texto decimal). */
export interface RespuestaProducto {
  id: string;
  nombre: string;
  marca: RespuestaMarcaResumen;
  precio: string;
  descripcion: string;
  disponibilidad: string;
  imagenes: RespuestaImagen[];
  creadoEn: string;
  actualizadoEn: string;
}

export interface RespuestaListaProductos {
  elementos: RespuestaProducto[];
  pagina: number;
  tamanio: number;
  total: number;
}

export function aRespuestaProducto(
  vista: VistaProducto,
  imagenes: RespuestaImagen[] = [],
): RespuestaProducto {
  const { producto, marca } = vista;
  return {
    id: producto.id,
    nombre: producto.nombre,
    marca: {
      id: marca.id,
      nombre: marca.nombre,
      color: marca.color,
      colorAcento: marca.colorAcento,
      textoSobreColor: marca.textoSobreColor,
      textoSobreAcento: marca.textoSobreAcento,
    },
    precio: producto.precio.aTexto(),
    descripcion: producto.descripcion,
    disponibilidad: producto.disponibilidad,
    imagenes,
    creadoEn: producto.creadoEn.toISOString(),
    actualizadoEn: producto.actualizadoEn.toISOString(),
  };
}

export function aRespuestaListaProductos(
  pagina: Pagina<VistaProducto>,
): RespuestaListaProductos {
  return {
    elementos: pagina.elementos.map((vista) => aRespuestaProducto(vista)),
    pagina: pagina.pagina,
    tamanio: pagina.tamanio,
    total: pagina.total,
  };
}
