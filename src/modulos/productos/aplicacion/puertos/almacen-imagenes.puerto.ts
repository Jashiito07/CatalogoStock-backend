import type { TipoImagen } from '../../dominio/imagen.js';

/**
 * Puerto del almacenamiento de archivos de imágenes (carpeta del servidor
 * fuera de Git, `RUTA_ALMACENAMIENTO`, D-46). Los nombres son siempre
 * `<uuid>.<ext>` ya validados por el dominio.
 */
export interface AlmacenImagenes {
  /** Guarda el archivo; falla si ya existe un archivo con ese nombre. */
  guardar(nombreArchivo: string, contenido: Uint8Array): Promise<void>;

  /** Borra el archivo; no falla si ya no existe. */
  eliminar(nombreArchivo: string): Promise<void>;

  /** Contenido del archivo o `null` si no existe. */
  leer(nombreArchivo: string): Promise<Uint8Array | null>;
}

export const ALMACEN_IMAGENES = Symbol('ALMACEN_IMAGENES');

/** Imagen leída para servirla públicamente. */
export interface ArchivoImagen {
  contenido: Uint8Array;
  tipo: TipoImagen;
}
