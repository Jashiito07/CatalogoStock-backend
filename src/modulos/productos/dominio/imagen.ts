import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import {
  ArchivoDemasiadoGrandeError,
  LimiteImagenesError,
  TipoNoAdmitidoError,
} from './errores-imagen.js';

/** D-46: máximo de imágenes por producto. */
export const MAXIMO_IMAGENES_POR_PRODUCTO = 5;

/** D-46: tamaño máximo de una imagen (2 MB). */
export const TAMANIO_MAXIMO_IMAGEN_BYTES = 2 * 1024 * 1024;

/** Extensión (y tipo) de las imágenes admitidas: JPG, PNG o WebP (D-46). */
export type TipoImagen = 'jpg' | 'png' | 'webp';

export const TIPOS_IMAGEN: readonly TipoImagen[] = ['jpg', 'png', 'webp'];

/** `Content-Type` con el que se sirve cada tipo. */
export const CONTENT_TYPE_POR_TIPO: Readonly<Record<TipoImagen, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Carpeta (dentro de `RUTA_ALMACENAMIENTO`) con las imágenes de productos. */
export const CARPETA_IMAGENES = 'productos';

const FIRMA_JPEG = [0xff, 0xd8, 0xff];
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const FIRMA_WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

function empiezaCon(
  contenido: Uint8Array,
  firma: readonly number[],
  desde = 0,
): boolean {
  return (
    contenido.length >= desde + firma.length &&
    firma.every((byte, indice) => contenido[desde + indice] === byte)
  );
}

/**
 * Tipo real de la imagen según sus primeros bytes (D-46, RNF-03): JPEG
 * `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A` y WebP `RIFF????WEBP`. Nunca se
 * usa la extensión ni el `Content-Type` que declara el cliente. `null` si no
 * es ninguno de los tres.
 */
export function detectarTipoImagen(contenido: Uint8Array): TipoImagen | null {
  if (empiezaCon(contenido, FIRMA_JPEG)) {
    return 'jpg';
  }
  if (empiezaCon(contenido, FIRMA_PNG)) {
    return 'png';
  }
  if (
    empiezaCon(contenido, FIRMA_RIFF) &&
    empiezaCon(contenido, FIRMA_WEBP, 8)
  ) {
    return 'webp';
  }
  return null;
}

/**
 * Valida un archivo subido: no mayor de 2 MB (413) y de un tipo real admitido
 * (415; un archivo vacío no tiene firma y también se rechaza). Devuelve el tipo detectado por contenido.
 */
export function validarArchivoImagen(contenido: Uint8Array): TipoImagen {
  if (contenido.length > TAMANIO_MAXIMO_IMAGEN_BYTES) {
    throw new ArchivoDemasiadoGrandeError();
  }
  const tipo = detectarTipoImagen(contenido);
  if (tipo === null) {
    throw new TipoNoAdmitidoError();
  }
  return tipo;
}

/** 422 `LIMITE_IMAGENES` si el producto ya tiene el máximo de imágenes. */
export function exigirCupoDeImagenes(cantidadActual: number): void {
  if (cantidadActual >= MAXIMO_IMAGENES_POR_PRODUCTO) {
    throw new LimiteImagenesError();
  }
}

/** Nombre de archivo público: `<uuid>.<ext>` (D-46); nunca el nombre original. */
export function nombreDeArchivo(id: string, tipo: TipoImagen): string {
  return `${id}.${tipo}`;
}

/** Nombre público válido: UUID en minúsculas y extensión admitida (sin rutas). */
export const FORMATO_NOMBRE_ARCHIVO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Tipo de un nombre público válido, o `null` si el nombre no cumple el formato. */
export function tipoDeNombreDeArchivo(nombre: string): TipoImagen | null {
  if (!FORMATO_NOMBRE_ARCHIVO.test(nombre)) {
    return null;
  }
  return nombre.slice(nombre.lastIndexOf('.') + 1) as TipoImagen;
}

export interface DatosImagen {
  id: string;
  productoId: string;
  /** Posición (0 = principal). */
  orden: number;
  tipo: TipoImagen;
  tamanioBytes: number;
  creadaEn: Date;
}

/** Vista pública de una imagen. La URL la arma la capa de presentación. */
export interface ImagenPublica {
  id: string;
  productoId: string;
  nombreArchivo: string;
  orden: number;
  /** `true` solo en la de `orden` 0. */
  principal: boolean;
}

/** Imagen de un producto (RF-PRO-01, D-46). Inmutable. */
export class Imagen {
  private constructor(private readonly datos: DatosImagen) {}

  static reconstituir(datos: DatosImagen): Imagen {
    return new Imagen(datos);
  }

  get id(): string {
    return this.datos.id;
  }
  get productoId(): string {
    return this.datos.productoId;
  }
  get orden(): number {
    return this.datos.orden;
  }
  get tipo(): TipoImagen {
    return this.datos.tipo;
  }
  get tamanioBytes(): number {
    return this.datos.tamanioBytes;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  get nombreArchivo(): string {
    return nombreDeArchivo(this.datos.id, this.datos.tipo);
  }
  /** Ruta relativa a `RUTA_ALMACENAMIENTO` (nunca la ruta completa del servidor). */
  get rutaRelativa(): string {
    return `${CARPETA_IMAGENES}/${this.nombreArchivo}`;
  }

  conOrden(orden: number): Imagen {
    return new Imagen({ ...this.datos, orden });
  }

  aPublico(): ImagenPublica {
    return {
      id: this.datos.id,
      productoId: this.datos.productoId,
      nombreArchivo: this.nombreArchivo,
      orden: this.datos.orden,
      principal: this.datos.orden === 0,
    };
  }
}

/** Ordena por `orden` (y por id ante un empate improbable). */
export function ordenarPorPosicion(imagenes: readonly Imagen[]): Imagen[] {
  return imagenes.toSorted(
    (a, b) => a.orden - b.orden || a.id.localeCompare(b.id),
  );
}

export const MENSAJE_ORDEN_INVALIDO =
  'Indique todas las imágenes del producto, sin repetir, en el nuevo orden.';

/**
 * Aplica un nuevo orden (RF-PRO-01): `ids` debe contener **todas** las
 * imágenes del producto, sin repetidas ni ajenas (400 `DATOS_INVALIDOS`). La
 * primera queda como principal. Devuelve las imágenes con su nueva posición.
 */
export function reordenarImagenes(
  actuales: readonly Imagen[],
  ids: readonly string[],
): Imagen[] {
  const porId = new Map(actuales.map((imagen) => [imagen.id, imagen]));
  const vistos = new Set(ids);
  const completo =
    ids.length === actuales.length &&
    vistos.size === ids.length &&
    ids.every((id) => porId.has(id));
  if (!completo) {
    throw new DatosInvalidosError(MENSAJE_ORDEN_INVALIDO, {
      errores: [{ campo: 'ids', errores: [MENSAJE_ORDEN_INVALIDO] }],
    });
  }
  return ids.map((id, posicion) =>
    (porId.get(id) as Imagen).conOrden(posicion),
  );
}

/** Reasigna posiciones 0..n-1 tras eliminar una (la primera pasa a principal). */
export function compactarOrden(imagenes: readonly Imagen[]): Imagen[] {
  return ordenarPorPosicion(imagenes).map((imagen, posicion) =>
    imagen.conOrden(posicion),
  );
}
