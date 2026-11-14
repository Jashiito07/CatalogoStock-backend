import type { Pagina } from '../../../../compartido/dominio/paginacion.js';
import { PREFIJO_API } from '../../../../configuracion/aplicacion-http.js';
import type { VistaProducto } from '../../aplicacion/vista-producto.js';
import type { ImagenPublica } from '../../dominio/imagen.js';

/** Imagen del contrato de productos (RF-PRO-01, D-46). */
export interface RespuestaImagen {
  id: string;
  /** Ruta pública `/api/v1/imagenes/<uuid>.<ext>`. */
  url: string;
  orden: number;
  principal: boolean;
}

/** Ruta pública de las imágenes (sin el servidor ni rutas de disco). */
export const RUTA_PUBLICA_IMAGENES = `/${PREFIJO_API}/imagenes`;

export function aRespuestaImagen(imagen: ImagenPublica): RespuestaImagen {
  return {
    id: imagen.id,
    url: `${RUTA_PUBLICA_IMAGENES}/${imagen.nombreArchivo}`,
    orden: imagen.orden,
    principal: imagen.principal,
  };
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
  imagenesPorProducto: ReadonlyMap<
    string,
    readonly ImagenPublica[]
  > = new Map(),
): RespuestaListaProductos {
  return {
    elementos: pagina.elementos.map((vista) =>
      aRespuestaProducto(
        vista,
        (imagenesPorProducto.get(vista.producto.id) ?? []).map(
          aRespuestaImagen,
        ),
      ),
    ),
    pagina: pagina.pagina,
    tamanio: pagina.tamanio,
    total: pagina.total,
  };
}
