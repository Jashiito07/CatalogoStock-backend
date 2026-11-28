import type { Dimensiones } from '../../dominio/imagen.js';

/** Una versión codificada de la imagen (JPEG) con sus dimensiones reales. */
export interface VersionImagen extends Dimensiones {
  contenido: Uint8Array;
}

/** Resultado de procesar una imagen subida (DEC-06). */
export interface ImagenProcesada {
  /** Lado mayor de 800 px como máximo (`LADO_DETALLE`). */
  detalle: VersionImagen;
  /** Lado mayor de 320 px como máximo (`LADO_MINIATURA`). */
  miniatura: VersionImagen;
}

/**
 * Puerto que decodifica la imagen subida y la vuelve a codificar (DEC-06):
 * aplica la orientación de la foto, quita todos los metadatos (EXIF, GPS) y
 * genera el detalle y la miniatura en JPEG. Lanza `ImagenIlegibleError` si no
 * puede decodificarla y `DimensionesNoAdmitidasError` si es demasiado grande.
 */
export interface ProcesadorImagenes {
  procesar(contenido: Uint8Array): Promise<ImagenProcesada>;
}

export const PROCESADOR_IMAGENES = Symbol('PROCESADOR_IMAGENES');
