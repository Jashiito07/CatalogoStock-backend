import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import {
  ArchivoDemasiadoGrandeError,
  DimensionesNoAdmitidasError,
  ImagenIlegibleError,
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

/**
 * DEC-06: toda imagen subida se vuelve a codificar en JPEG (así se quitan los
 * metadatos EXIF, incluido el GPS del celular) en dos tamaños.
 */
export const TIPO_IMAGEN_GUARDADA: TipoImagen = 'jpg';
/** Lado mayor (px) y calidad JPEG de la imagen de detalle. */
export const LADO_DETALLE = 800;
export const CALIDAD_DETALLE = 82;
/** Lado mayor (px) y calidad JPEG de la miniatura de las listas. */
export const LADO_MINIATURA = 320;
export const CALIDAD_MINIATURA = 78;

/** DEC-06: límites de la imagen original, comprobados antes de decodificarla. */
export const LADO_MAXIMO_ENTRADA = 8000;
export const PIXELES_MAXIMOS_ENTRADA = 40_000_000;

export interface Dimensiones {
  ancho: number;
  alto: number;
}

const MARCADORES_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Dimensiones de un JPEG según su segmento SOF (Start Of Frame). */
function dimensionesJpeg(b: Uint8Array): Dimensiones | null {
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) {
      return null;
    }
    // Bytes 0xFF de relleno antes del marcador.
    while (b[i + 1] === 0xff && i + 2 < b.length) {
      i++;
    }
    const marcador = b[i + 1];
    i += 2;
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) {
      continue; // marcadores sin longitud
    }
    if (marcador === 0xd9 || marcador === 0xda || i + 1 >= b.length) {
      return null; // fin de imagen o inicio de datos sin SOF previo
    }
    const longitud = (b[i] << 8) | b[i + 1];
    if (longitud < 2) {
      return null;
    }
    if (MARCADORES_SOF.has(marcador)) {
      if (i + 7 > b.length) {
        return null;
      }
      return { alto: (b[i + 3] << 8) | b[i + 4], ancho: (b[i + 5] << 8) | b[i + 6] };
    }
    i += longitud;
  }
  return null;
}

function vista(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

function textoEn(b: Uint8Array, desde: number, largo: number): string {
  return String.fromCharCode(...b.subarray(desde, desde + largo));
}

/** Dimensiones de un PNG según su bloque IHDR (siempre el primero). */
function dimensionesPng(b: Uint8Array): Dimensiones | null {
  if (b.length < 24 || textoEn(b, 12, 4) !== 'IHDR') {
    return null;
  }
  const v = vista(b);
  return { ancho: v.getUint32(16), alto: v.getUint32(20) };
}

/** Dimensiones de un WebP con pérdida (VP8), sin pérdida (VP8L) o extendido (VP8X). */
function dimensionesWebp(b: Uint8Array): Dimensiones | null {
  if (b.length < 30) {
    return null;
  }
  const v = vista(b);
  const bloque = textoEn(b, 12, 4);
  if (bloque === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) {
      return null;
    }
    return {
      ancho: v.getUint16(26, true) & 0x3fff,
      alto: v.getUint16(28, true) & 0x3fff,
    };
  }
  if (bloque === 'VP8L') {
    if (b[20] !== 0x2f) {
      return null;
    }
    const bits = v.getUint32(21, true);
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (bloque === 'VP8X') {
    const ancho = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const alto = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { ancho, alto };
  }
  return null;
}

/**
 * Lee el ancho y el alto en la cabecera de la imagen, SIN decodificarla
 * (DEC-06). `null` si la cabecera no se puede leer.
 */
export function leerDimensiones(
  contenido: Uint8Array,
  tipo: TipoImagen,
): Dimensiones | null {
  if (tipo === 'jpg') {
    return dimensionesJpeg(contenido);
  }
  if (tipo === 'png') {
    return dimensionesPng(contenido);
  }
  return dimensionesWebp(contenido);
}

/**
 * 422 `DIMENSIONES_NO_ADMITIDAS` si supera 8000 px por lado o 40 megapíxeles;
 * 415 si alguna dimensión es cero (una cabecera así no es una imagen válida).
 */
export function validarDimensiones(dimensiones: Dimensiones): Dimensiones {
  const { ancho, alto } = dimensiones;
  if (!(ancho > 0 && alto > 0)) {
    throw new ImagenIlegibleError();
  }
  if (
    ancho > LADO_MAXIMO_ENTRADA ||
    alto > LADO_MAXIMO_ENTRADA ||
    ancho * alto > PIXELES_MAXIMOS_ENTRADA
  ) {
    throw new DimensionesNoAdmitidasError();
  }
  return dimensiones;
}

/** Lee la cabecera y valida las dimensiones antes de decodificar (DEC-06). */
export function exigirDimensionesAdmitidas(
  contenido: Uint8Array,
  tipo: TipoImagen,
): Dimensiones {
  const dimensiones = leerDimensiones(contenido, tipo);
  if (dimensiones === null) {
    throw new ImagenIlegibleError();
  }
  return validarDimensiones(dimensiones);
}

/**
 * Tamaño reducido para que el lado mayor no pase de `ladoMaximo`, manteniendo
 * la proporción. Nunca agranda una imagen pequeña.
 */
export function tamanioAjustado(
  dimensiones: Dimensiones,
  ladoMaximo: number,
): Dimensiones {
  const escala = Math.min(
    1,
    ladoMaximo / Math.max(dimensiones.ancho, dimensiones.alto),
  );
  return {
    ancho: Math.max(1, Math.round(dimensiones.ancho * escala)),
    alto: Math.max(1, Math.round(dimensiones.alto * escala)),
  };
}

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

/** Nombre público de la miniatura: `<uuid>-m.<ext>` (DEC-06). */
export function nombreDeMiniatura(id: string, tipo: TipoImagen): string {
  return `${id}-m.${tipo}`;
}

/**
 * Nombre público válido: UUID en minúsculas, `-m` opcional (miniatura) y
 * extensión admitida (sin rutas).
 */
export const FORMATO_NOMBRE_ARCHIVO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-m)?\.(jpg|png|webp)$/;

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
  /** Tamaño en bytes de la imagen de detalle. */
  tamanioBytes: number;
  /** Dimensiones de la imagen de detalle; `null` en imágenes anteriores a DEC-06. */
  ancho: number | null;
  alto: number | null;
  /** `false` en las imágenes anteriores a DEC-06, que no tienen miniatura. */
  conMiniatura: boolean;
  creadaEn: Date;
}

/** Vista pública de una imagen. La URL la arma la capa de presentación. */
export interface ImagenPublica {
  id: string;
  productoId: string;
  nombreArchivo: string;
  /** Miniatura; si la imagen no tiene, es la misma imagen de detalle. */
  nombreMiniatura: string;
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
  get ancho(): number | null {
    return this.datos.ancho;
  }
  get alto(): number | null {
    return this.datos.alto;
  }
  get conMiniatura(): boolean {
    return this.datos.conMiniatura;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  get nombreArchivo(): string {
    return nombreDeArchivo(this.datos.id, this.datos.tipo);
  }
  /** Nombre de la miniatura, o `null` si la imagen no tiene (anterior a DEC-06). */
  get nombreMiniatura(): string | null {
    return this.datos.conMiniatura
      ? nombreDeMiniatura(this.datos.id, this.datos.tipo)
      : null;
  }
  /** Todos los archivos de la imagen: detalle y, si tiene, miniatura. */
  get nombresArchivos(): string[] {
    const miniatura = this.nombreMiniatura;
    return miniatura === null
      ? [this.nombreArchivo]
      : [this.nombreArchivo, miniatura];
  }
  /** Ruta relativa a `RUTA_ALMACENAMIENTO` (nunca la ruta completa del servidor). */
  get rutaRelativa(): string {
    return `${CARPETA_IMAGENES}/${this.nombreArchivo}`;
  }
  /** Ruta relativa de la miniatura, o `null` si no tiene. */
  get rutaMiniatura(): string | null {
    const miniatura = this.nombreMiniatura;
    return miniatura === null ? null : `${CARPETA_IMAGENES}/${miniatura}`;
  }

  conOrden(orden: number): Imagen {
    return new Imagen({ ...this.datos, orden });
  }

  aPublico(): ImagenPublica {
    return {
      id: this.datos.id,
      productoId: this.datos.productoId,
      nombreArchivo: this.nombreArchivo,
      nombreMiniatura: this.nombreMiniatura ?? this.nombreArchivo,
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
