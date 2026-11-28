/**
 * Dobles en memoria para las pruebas de los casos de uso de imágenes (2.4).
 * Termina en `spec.ts` (no en `.spec.ts`) para que no se compile en `dist/` ni
 * Vitest lo tome como archivo de pruebas.
 */
import { ImagenIlegibleError } from '../../dominio/errores-imagen.js';
import type { Imagen } from '../../dominio/imagen.js';
import type { AlmacenImagenes } from '../puertos/almacen-imagenes.puerto.js';
import type { ImagenRepositorio } from '../puertos/imagen.repositorio.js';
import type {
  ImagenProcesada,
  ProcesadorImagenes,
} from '../puertos/procesador-imagenes.puerto.js';

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];

/** Cabecera PNG válida (firma + IHDR) con las dimensiones pedidas, sin datos. */
export function cabeceraPng(ancho = 1200, alto = 900): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(ancho), ...be32(alto),
    8, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

/** Cabecera JPEG válida (SOI + SOF0) con las dimensiones pedidas, sin datos. */
export function cabeceraJpg(ancho = 1200, alto = 900): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, ...be16(17), 8, ...be16(alto), ...be16(ancho), 3,
    1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
}

/**
 * Procesador falso: no decodifica; devuelve contenidos reconocibles
 * («detalle-N», «miniatura-N») con dimensiones fijas y cuenta las llamadas.
 */
export class ProcesadorImagenesFalso implements ProcesadorImagenes {
  llamadas = 0;
  /** Si es `true`, `procesar` falla como una imagen dañada. */
  ilegible = false;

  procesar(): Promise<ImagenProcesada> {
    this.llamadas++;
    if (this.ilegible) {
      return Promise.reject(new ImagenIlegibleError());
    }
    const n = this.llamadas;
    return Promise.resolve({
      detalle: { contenido: new TextEncoder().encode(`detalle-${n}`), ancho: 800, alto: 600 },
      miniatura: { contenido: new TextEncoder().encode(`miniatura-${n}`), ancho: 320, alto: 240 },
    });
  }
}

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
  /** Si se define, falla solo al guardar un nombre que cumple esta condición. */
  fallarSi: ((nombreArchivo: string) => boolean) | undefined;

  guardar(nombreArchivo: string, contenido: Uint8Array): Promise<void> {
    if (this.falloAlGuardar) {
      return Promise.reject(this.falloAlGuardar);
    }
    if (this.fallarSi?.(nombreArchivo)) {
      return Promise.reject(new Error(`no se pudo guardar ${nombreArchivo}`));
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
