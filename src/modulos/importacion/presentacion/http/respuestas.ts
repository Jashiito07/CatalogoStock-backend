import type { Pagina } from '../../../../compartido/dominio/paginacion.js';
import type { VistaImportacion } from '../../aplicacion/vista-importacion.js';
import type { BorradorPublico } from '../../dominio/borrador.js';
import type { TotalesImportacion } from '../../dominio/importacion.js';

/** Resumen de marca dentro de una Importación (contrato, «Modelo»). */
export interface RespuestaMarcaResumen {
  id: string;
  nombre: string;
  color: string;
  colorAcento: string | null;
  textoSobreColor: string;
  textoSobreAcento: string | null;
}

/** Importación del contrato de importación. */
export interface RespuestaImportacion {
  id: string;
  nombreArchivo: string;
  marca: RespuestaMarcaResumen;
  paginas: number;
  totales: TotalesImportacion;
  creadaEn: string;
}

/** Borrador del contrato: los precios viajan como texto decimal exacto. */
export interface RespuestaBorrador {
  id: string;
  idImportacion: string;
  pagina: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: string | null;
  precioNormal: string | null;
  marcaId: string;
  disponibilidad: string;
  estado: string;
  advertencias: string[];
  idProducto: string | null;
}

export interface RespuestaListaBorradores {
  elementos: RespuestaBorrador[];
  pagina: number;
  tamanio: number;
  total: number;
}

export function aRespuestaImportacion(
  vista: VistaImportacion,
): RespuestaImportacion {
  const { importacion, marca, totales } = vista;
  return {
    id: importacion.id,
    nombreArchivo: importacion.nombreArchivo,
    marca: {
      id: marca.id,
      nombre: marca.nombre,
      color: marca.color,
      colorAcento: marca.colorAcento,
      textoSobreColor: marca.textoSobreColor,
      textoSobreAcento: marca.textoSobreAcento,
    },
    paginas: importacion.paginas,
    totales,
    creadaEn: importacion.creadaEn.toISOString(),
  };
}

export function aRespuestaBorrador(borrador: BorradorPublico): RespuestaBorrador {
  return {
    id: borrador.id,
    idImportacion: borrador.idImportacion,
    pagina: borrador.pagina,
    codigo: borrador.codigo,
    nombre: borrador.nombre,
    descripcion: borrador.descripcion,
    precio: borrador.precio === null ? null : borrador.precio.aTexto(),
    precioNormal:
      borrador.precioNormal === null ? null : borrador.precioNormal.aTexto(),
    marcaId: borrador.marcaId,
    disponibilidad: borrador.disponibilidad,
    estado: borrador.estado,
    advertencias: [...borrador.advertencias],
    idProducto: borrador.idProducto,
  };
}

export function aRespuestaListaBorradores(
  pagina: Pagina<BorradorPublico>,
): RespuestaListaBorradores {
  return {
    elementos: pagina.elementos.map(aRespuestaBorrador),
    pagina: pagina.pagina,
    tamanio: pagina.tamanio,
    total: pagina.total,
  };
}
