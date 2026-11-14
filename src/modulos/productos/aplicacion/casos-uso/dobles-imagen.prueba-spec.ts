/**
 * Dobles en memoria para las pruebas de los casos de uso de imágenes (2.4).
 * Termina en `spec.ts` (no en `.spec.ts`) para que no se compile en `dist/` ni
 * Vitest lo tome como archivo de pruebas.
 */
import type { Imagen } from '../../dominio/imagen.js';
import type { AlmacenImagenes } from '../puertos/almacen-imagenes.puerto.js';
import type { ImagenRepositorio } from '../puertos/imagen.repositorio.js';

export class ImagenRepositorioEnMemoria implements ImagenRepositorio {
  imagenes: Imagen[] = [];
  /** Si se define, `insertar` falla (simula un error de la base). */
  falloAlInsertar: Error | undefined;

  listarPorProducto(idProducto: string): Promise<Imagen[]> {
    return Promise.resolve(
      this.imagenes
        .filter((i) => i.productoId === idProducto)
        .toSorted((a, b) => a.orden - b.orden),
    );
  }

  listarPorProductos(idsProducto: readonly string[]): Promise<Imagen[]> {
    return Promise.resolve(
      this.imagenes.filter((i) => idsProducto.includes(i.productoId)),
    );
  }

  buscar(idProducto: string, idImagen: string): Promise<Imagen | null> {
    return Promise.resolve(
      this.imagenes.find(
        (i) => i.id === idImagen && i.productoId === idProducto,
      ) ?? null,
    );
  }

  insertar(imagen: Imagen): Promise<void> {
    if (this.falloAlInsertar) {
      return Promise.reject(this.falloAlInsertar);
    }
    this.imagenes.push(imagen);
    return Promise.resolve();
  }

  guardarOrden(imagenes: readonly Imagen[]): Promise<void> {
    for (const nueva of imagenes) {
      const indice = this.imagenes.findIndex((i) => i.id === nueva.id);
      if (indice >= 0) {
        this.imagenes[indice] = nueva;
      }
    }
    return Promise.resolve();
  }

  eliminar(idImagen: string): Promise<boolean> {
    const antes = this.imagenes.length;
    this.imagenes = this.imagenes.filter((i) => i.id !== idImagen);
    return Promise.resolve(this.imagenes.length < antes);
  }
}

export class AlmacenImagenesEnMemoria implements AlmacenImagenes {
  archivos = new Map<string, Uint8Array>();
  /** Si se define, `guardar` falla. */
  falloAlGuardar: Error | undefined;

  guardar(nombreArchivo: string, contenido: Uint8Array): Promise<void> {
    if (this.falloAlGuardar) {
      return Promise.reject(this.falloAlGuardar);
    }
    this.archivos.set(nombreArchivo, contenido);
    return Promise.resolve();
  }

  eliminar(nombreArchivo: string): Promise<void> {
    this.archivos.delete(nombreArchivo);
    return Promise.resolve();
  }

  leer(nombreArchivo: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.archivos.get(nombreArchivo) ?? null);
  }
}
