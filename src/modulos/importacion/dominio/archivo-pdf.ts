import {
  ArchivoDemasiadoGrandeError,
  FormatoNoPermitidoError,
  PdfIlegibleError,
} from './errores-importacion.js';

/** D-46 / contrato de importación: tamaño máximo del PDF (60 MB). */
export const TAMANIO_MAXIMO_PDF_BYTES = 60 * 1024 * 1024;

/** Contrato de importación: máximo de páginas de un PDF. */
export const MAXIMO_PAGINAS_PDF = 400;

/** Contrato de importación: tiempo máximo de análisis (60 s). */
export const TIEMPO_MAXIMO_ANALISIS_MS = 60_000;

/** Longitud máxima del nombre informativo del archivo. */
export const LONGITUD_MAXIMA_NOMBRE_ARCHIVO = 120;

const NOMBRE_ARCHIVO_POR_DEFECTO = 'catalogo.pdf';

const FIRMA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Cuántos bytes de cada extremo se revisan en busca del diccionario `/Encrypt`. */
const BYTES_REVISADOS_CIFRADO = 4096;
const MARCA_CIFRADO = '/Encrypt';

/** `true` si los primeros bytes son la firma real `%PDF-` (no la extensión ni el `Content-Type`). */
export function tieneFirmaPdf(contenido: Uint8Array): boolean {
  return (
    contenido.length >= FIRMA_PDF.length &&
    FIRMA_PDF.every((byte, indice) => contenido[indice] === byte)
  );
}

/**
 * El diccionario del tráiler de un PDF cifrado lleva `/Encrypt`; vive en texto
 * plano al principio (PDF linealizado) o al final del archivo. Se revisan solo
 * esos extremos: no se recorre el archivo completo.
 */
export function parecePdfCifrado(contenido: Uint8Array): boolean {
  const extremos = [
    contenido.subarray(0, BYTES_REVISADOS_CIFRADO),
    contenido.subarray(
      Math.max(0, contenido.length - BYTES_REVISADOS_CIFRADO),
    ),
  ];
  const decodificador = new TextDecoder('latin1');
  return extremos.some((trozo) =>
    decodificador.decode(trozo).includes(MARCA_CIFRADO),
  );
}

/**
 * Multer entrega el nombre original leído como latin1: si todos los
 * caracteres caben en un byte, se vuelve a leer como UTF-8 (`Ñandú.pdf`).
 */
function corregirCodificacion(nombre: string): string {
  const codigos = [...nombre].map((caracter) => caracter.codePointAt(0) ?? 0);
  if (codigos.some((codigo) => codigo > 0xff)) {
    return nombre;
  }
  const decodificado = new TextDecoder('utf-8').decode(Uint8Array.from(codigos));
  return decodificado.includes('\uFFFD') ? nombre : decodificado;
}

/**
 * Valida un archivo subido: no mayor de 40 MB (413), con la firma real
 * `%PDF-` (415; un archivo vacío no tiene firma) y sin cifrar (422
 * `PDF_ILEGIBLE`). Nunca se confía en el nombre ni en el tipo declarados.
 */
export function validarArchivoPdf(contenido: Uint8Array): void {
  if (contenido.length > TAMANIO_MAXIMO_PDF_BYTES) {
    throw new ArchivoDemasiadoGrandeError('El PDF no puede superar los 60 MB.');
  }
  if (!tieneFirmaPdf(contenido)) {
    throw new FormatoNoPermitidoError();
  }
  if (parecePdfCifrado(contenido)) {
    throw new PdfIlegibleError('El PDF está cifrado y no se puede leer.');
  }
}

/**
 * Nombre informativo del archivo (contrato: se sanea, sin rutas, hasta 120
 * caracteres). Se queda con lo posterior a la última barra, corrige el
 * texto UTF-8 que Multer entrega como latin1 y cambia por `_` todo lo que no
 * sea letra, número, espacio, punto, guion o paréntesis.
 */
export function sanearNombreArchivo(entrada: unknown): string {
  if (typeof entrada !== 'string') {
    return NOMBRE_ARCHIVO_POR_DEFECTO;
  }
  const sinRuta = corregirCodificacion(entrada).split(/[\\/]/).pop() ?? '';
  const limpio = [...sinRuta]
    .map((caracter) => (/[\p{L}\p{N} ._()-]/u.test(caracter) ? caracter : '_'))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+/, '')
    .trim();
  if (limpio === '' || /^_+$/.test(limpio)) {
    return NOMBRE_ARCHIVO_POR_DEFECTO;
  }
  const caracteres = [...limpio];
  if (caracteres.length <= LONGITUD_MAXIMA_NOMBRE_ARCHIVO) {
    return limpio;
  }
  // Conserva la extensión al recortar.
  const extension = /\.[A-Za-z0-9]{1,5}$/.exec(limpio)?.[0] ?? '';
  const base = caracteres
    .slice(0, LONGITUD_MAXIMA_NOMBRE_ARCHIVO - extension.length)
    .join('');
  return `${base}${extension}`;
}
