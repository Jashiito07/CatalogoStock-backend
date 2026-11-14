import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Logger } from '@nestjs/common';
import type { AlmacenImagenes } from '../../aplicacion/puertos/almacen-imagenes.puerto.js';
import {
  CARPETA_IMAGENES,
  FORMATO_NOMBRE_ARCHIVO,
} from '../../dominio/imagen.js';

function esErrorDeSistema(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

/**
 * Adaptador del puerto AlmacenImagenes en el disco del servidor (D-46). Las
 * imágenes viven en `<RUTA_ALMACENAMIENTO>/productos/` (fuera de Git) y solo
 * se accede a ellas por nombre `<uuid>.<ext>`: cualquier otro nombre se
 * rechaza antes de tocar el disco (sin path traversal) y la ruta resultante se
 * comprueba dentro de la carpeta. Nunca se registran rutas completas en logs.
 */
export class AlmacenImagenesDisco implements AlmacenImagenes {
  private readonly carpeta: string;
  private readonly logger = new Logger('AlmacenImagenes');

  constructor(rutaAlmacenamiento: string) {
    this.carpeta = resolve(rutaAlmacenamiento, CARPETA_IMAGENES);
  }

  /** Ruta del archivo; lanza si el nombre no es `<uuid>.<ext>` o se sale de la carpeta. */
  private rutaDe(nombreArchivo: string): string {
    if (!FORMATO_NOMBRE_ARCHIVO.test(nombreArchivo)) {
      throw new Error('Nombre de archivo de imagen no válido.');
    }
    const ruta = resolve(join(this.carpeta, nombreArchivo));
    if (!ruta.startsWith(this.carpeta + sep)) {
      throw new Error('Nombre de archivo de imagen no válido.');
    }
    return ruta;
  }

  async guardar(
    nombreArchivo: string,
    contenido: Uint8Array,
  ): Promise<void> {
    const ruta = this.rutaDe(nombreArchivo);
    await mkdir(this.carpeta, { recursive: true });
    // `wx`: nunca sobrescribe un archivo existente.
    await writeFile(ruta, contenido, { flag: 'wx' });
  }

  async eliminar(nombreArchivo: string): Promise<void> {
    try {
      await unlink(this.rutaDe(nombreArchivo));
    } catch (error) {
      if (esErrorDeSistema(error, 'ENOENT')) {
        return;
      }
      // La fila ya no existe: un archivo huérfano no debe romper la operación.
      this.logger.warn(
        `No se pudo borrar el archivo de la imagen ${nombreArchivo}.`,
      );
    }
  }

  async leer(nombreArchivo: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.rutaDe(nombreArchivo));
    } catch (error) {
      if (esErrorDeSistema(error, 'ENOENT')) {
        return null;
      }
      throw error;
    }
  }
}
