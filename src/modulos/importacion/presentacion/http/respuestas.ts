import type { Pagina } from '../../../../compartido/dominio/paginacion.js';
import type { VistaImportacion } from '../../aplicacion/vista-importacion.js';
import type { BorradorPublico } from '../../dominio/borrador.js';
import type { ProductoAusente } from '../../aplicacion/puertos/productos-existentes.puerto.js';
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
  /** `VIGENTE` o `ARCHIVADA` (D-57). */
  estado: string;
  totales: TotalesImportacion;
  creadaEn: string;
  /** Cuándo se archivó; `null` si es la vigente. */
  archivadaEn: string | null;
  /** `archivadaEn` + 6 meses calendario; `null` si es la vigente (D-57). */
  eliminaEn: string | null;
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
  /** Producto de la misma marca con el mismo código, si existe: al aprobar se actualiza su precio (D-57). */
  productoExistente: { id: string; nombre: string; precio: string } | null;
  /** Cómo se emparejó con `productoExistente`: por `CODIGO` o, sin código, por `NOMBRE` (D-57); `null` si no hay. */
  emparejadoPor: 'CODIGO' | 'NOMBRE' | null;
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
    estado: importacion.estado,
    totales,
    creadaEn: importacion.creadaEn.toISOString(),
    archivadaEn: importacion.archivadaEn?.toISOString() ?? null,
    eliminaEn: importacion.eliminaEn?.toISOString() ?? null,
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
    productoExistente:
      borrador.productoExistente === null
        ? null
        : {
            id: borrador.productoExistente.id,
            nombre: borrador.productoExistente.nombre,
            precio: borrador.productoExistente.precio.aTexto(),
          },
    emparejadoPor: borrador.productoExistente?.emparejadoPor ?? null,
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

export interface RespuestaListaImportaciones {
  elementos: RespuestaImportacion[];
  pagina: number;
  tamanio: number;
  total: number;
}

export function aRespuestaListaImportaciones(
  pagina: Pagina<VistaImportacion>,
): RespuestaListaImportaciones {
  return {
    elementos: pagina.elementos.map(aRespuestaImportacion),
    pagina: pagina.pagina,
    tamanio: pagina.tamanio,
    total: pagina.total,
  };
}

/** Producto de la marca que no aparece en el catálogo nuevo (D-57). */
export interface RespuestaProductoAusente {
  id: string;
  nombre: string;
  codigo: string;
  precio: string;
  disponibilidad: string;
}

export interface RespuestaListaAusentes {
  elementos: RespuestaProductoAusente[];
  pagina: number;
  tamanio: number;
  total: number;
}

export function aRespuestaListaAusentes(
  pagina: Pagina<ProductoAusente>,
): RespuestaListaAusentes {
  return {
    elementos: pagina.elementos.map((producto) => ({
      id: producto.id,
      nombre: producto.nombre,
      codigo: producto.codigo,
      precio: producto.precio.aTexto(),
      disponibilidad: producto.disponibilidad,
    })),
    pagina: pagina.pagina,
    tamanio: pagina.tamanio,
    total: pagina.total,
  };
}