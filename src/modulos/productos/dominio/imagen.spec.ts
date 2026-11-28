import { ErrorDominio } from '../../../compartido/dominio/errores.js';
import {
  compactarOrden,
  detectarTipoImagen,
  exigirCupoDeImagenes,
  exigirDimensionesAdmitidas,
  Imagen,
  leerDimensiones,
  MAXIMO_IMAGENES_POR_PRODUCTO,
  nombreDeArchivo,
  nombreDeMiniatura,
  reordenarImagenes,
  TAMANIO_MAXIMO_IMAGEN_BYTES,
  tamanioAjustado,
  tipoDeNombreDeArchivo,
  validarArchivoImagen,
  validarDimensiones,
} from './imagen.js';

const ID_PRODUCTO = '00000000-0000-4000-8000-0000000000a1';
const ID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AHORA = new Date('2026-11-12T10:00:00.000Z');

/** Imagen anterior a DEC-06: PNG sin miniatura ni dimensiones. */
const imagen = (n: number, orden: number) =>
  Imagen.reconstituir({
    id: ID(n),
    productoId: ID_PRODUCTO,
    orden,
    tipo: 'png',
    tamanioBytes: 100,
    ancho: null,
    alto: null,
    conMiniatura: false,
    creadaEn: AHORA,
  });

/** Imagen guardada con DEC-06: JPEG con miniatura. */
const imagenConMiniatura = (n: number) =>
  Imagen.reconstituir({
    id: ID(n),
    productoId: ID_PRODUCTO,
    orden: 0,
    tipo: 'jpg',
    tamanioBytes: 1000,
    ancho: 800,
    alto: 600,
    conMiniatura: true,
    creadaEn: AHORA,
  });

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const le32 = (n: number) => [...le16(n & 0xffff), ...le16((n >>> 16) & 0xffff)];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Cabecera PNG con el bloque IHDR (sin datos de imagen). */
const pngCabecera = (ancho: number, alto: number) =>
  new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), ...ascii('IHDR'), ...be32(ancho), ...be32(alto),
    8, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);

/** Cabecera JPEG: SOI, APP0 (JFIF), relleno 0xFF y un segmento SOF. */
const jpgCabecera = (ancho: number, alto: number, sof = 0xc0) =>
  new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, ...be16(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xff, sof, ...be16(17), 8, ...be16(alto), ...be16(ancho), 3,
    1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);

const riff = (bloque: string, datos: number[]) =>
  new Uint8Array([
    ...ascii('RIFF'), ...le32(4 + 8 + datos.length), ...ascii('WEBP'),
    ...ascii(bloque), ...le32(datos.length), ...datos,
  ]);
const webpVp8 = (ancho: number, alto: number) =>
  riff('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...le16(ancho), ...le16(alto), 0, 0]);
const webpVp8l = (ancho: number, alto: number) =>
  riff('VP8L', [0x2f, ...le32((ancho - 1) | ((alto - 1) << 14)), 0, 0, 0, 0, 0]);
const webpVp8x = (ancho: number, alto: number) =>
  riff('VP8X', [0x10, 0, 0, 0, ...le24(ancho - 1), ...le24(alto - 1)]);

function bytes(...valores: number[]): Uint8Array {
  const contenido = new Uint8Array(32).fill(0x41);
  contenido.set(valores);
  return contenido;
}

const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

function codigoDe(accion: () => unknown): string {
  try {
    accion();
  } catch (error) {
    if (error instanceof ErrorDominio) {
      return error.codigo;
    }
    throw error;
  }
  throw new Error('No lanzó ningún error de dominio');
}

const texto = (valor: string) => new TextEncoder().encode(valor);

describe('D-46: tipo real de la imagen por firma de bytes', () => {
  it('reconoce JPG, PNG y WebP por sus primeros bytes', () => {
    expect(detectarTipoImagen(JPG)).toBe('jpg');
    expect(detectarTipoImagen(PNG)).toBe('png');
    expect(detectarTipoImagen(WEBP)).toBe('webp');
  });

  it('rechaza texto, ejecutables, SVG, GIF, RIFF que no es WebP y archivos vacíos o truncados', () => {
    expect(detectarTipoImagen(texto('hola, esto es texto'))).toBeNull();
    expect(detectarTipoImagen(texto('MZ programa'))).toBeNull();
    expect(detectarTipoImagen(texto('<svg></svg>'))).toBeNull();
    expect(detectarTipoImagen(texto('GIF89a......'))).toBeNull();
    expect(
      detectarTipoImagen(
        bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45),
      ),
    ).toBeNull();
    expect(detectarTipoImagen(new Uint8Array(0))).toBeNull();
    expect(detectarTipoImagen(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(
      detectarTipoImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    ).toBeNull();
    expect(
      detectarTipoImagen(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57]),
      ),
    ).toBeNull();
  });

  it('un PNG que se declara .jpg se reconoce como PNG (no se confía en la extensión)', () => {
    expect(validarArchivoImagen(PNG)).toBe('png');
  });
});

describe('D-46: tamaño y cantidad', () => {
  it('acepta exactamente 2 MB y rechaza 2 MB + 1 byte con ARCHIVO_DEMASIADO_GRANDE', () => {
    const justo = new Uint8Array(TAMANIO_MAXIMO_IMAGEN_BYTES).fill(0x41);
    justo.set(PNG);
    expect(validarArchivoImagen(justo)).toBe('png');

    const excedido = new Uint8Array(TAMANIO_MAXIMO_IMAGEN_BYTES + 1).fill(0x41);
    excedido.set(PNG);
    expect(codigoDe(() => validarArchivoImagen(excedido))).toBe(
      'ARCHIVO_DEMASIADO_GRANDE',
    );
  });

  it('un contenido que no es imagen falla con TIPO_NO_ADMITIDO', () => {
    expect(
      codigoDe(() => validarArchivoImagen(new TextEncoder().encode('texto'))),
    ).toBe('TIPO_NO_ADMITIDO');
  });

  it('admite hasta 5 imágenes; la sexta falla con LIMITE_IMAGENES', () => {
    expect(MAXIMO_IMAGENES_POR_PRODUCTO).toBe(5);
    expect(() => exigirCupoDeImagenes(4)).not.toThrow();
    expect(codigoDe(() => exigirCupoDeImagenes(5))).toBe('LIMITE_IMAGENES');
  });
});

describe('D-46: nombres de archivo', () => {
  it('el nombre es <uuid>.<ext>', () => {
    expect(nombreDeArchivo(ID(1), 'webp')).toBe(`${ID(1)}.webp`);
    expect(imagen(1, 0).rutaRelativa).toBe(`productos/${ID(1)}.png`);
  });

  it('solo se aceptan nombres <uuid>.(jpg|png|webp) en minúsculas, sin rutas', () => {
    expect(tipoDeNombreDeArchivo(`${ID(1)}.jpg`)).toBe('jpg');
    expect(tipoDeNombreDeArchivo(`${ID(1)}.png`)).toBe('png');
    expect(tipoDeNombreDeArchivo(`${ID(1)}.webp`)).toBe('webp');
    for (const malo of [
      '../x.png',
      `../${ID(1)}.png`,
      `${ID(1)}.gif`,
      `${ID(1)}.png.exe`,
      `${ID(1)}`,
      'ABCDEF01-2345-4678-9ABC-DEF012345678.png',
      `/${ID(1)}.png`,
      `a\\${ID(1)}.png`,
      `${ID(1)}.png\n`,
      '',
    ]) {
      expect([malo, tipoDeNombreDeArchivo(malo)]).toEqual([malo, null]);
    }
  });
});

describe('DEC-06: dimensiones leídas de la cabecera, sin decodificar', () => {
  it('lee el ancho y el alto de PNG, JPEG (base y progresivo) y WebP (VP8, VP8L, VP8X)', () => {
    expect(leerDimensiones(pngCabecera(1600, 1200), 'png')).toEqual({ ancho: 1600, alto: 1200 });
    expect(leerDimensiones(jpgCabecera(640, 480), 'jpg')).toEqual({ ancho: 640, alto: 480 });
    expect(leerDimensiones(jpgCabecera(4000, 3000, 0xc2), 'jpg')).toEqual({ ancho: 4000, alto: 3000 });
    expect(leerDimensiones(webpVp8(300, 200), 'webp')).toEqual({ ancho: 300, alto: 200 });
    expect(leerDimensiones(webpVp8l(1024, 768), 'webp')).toEqual({ ancho: 1024, alto: 768 });
    expect(leerDimensiones(webpVp8x(5000, 4000), 'webp')).toEqual({ ancho: 5000, alto: 4000 });
  });

  it('cabeceras truncadas, sin SOF o con bloques desconocidos → null', () => {
    expect(leerDimensiones(pngCabecera(10, 10).subarray(0, 20), 'png')).toBeNull();
    expect(leerDimensiones(JPG, 'jpg')).toBeNull();
    expect(leerDimensiones(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]), 'jpg')).toBeNull();
    expect(leerDimensiones(jpgCabecera(10, 10).subarray(0, 25), 'jpg')).toBeNull();
    expect(
      leerDimensiones(riff('ALPH', Array.from({ length: 20 }, () => 0)), 'webp'),
    ).toBeNull();
    expect(leerDimensiones(WEBP, 'webp')).toBeNull();
  });

  it('admite hasta 8000 px por lado y 40 megapíxeles; más → DIMENSIONES_NO_ADMITIDAS', () => {
    expect(validarDimensiones({ ancho: 8000, alto: 5000 })).toEqual({ ancho: 8000, alto: 5000 });
    expect(codigoDe(() => validarDimensiones({ ancho: 8001, alto: 1 }))).toBe('DIMENSIONES_NO_ADMITIDAS');
    expect(codigoDe(() => validarDimensiones({ ancho: 1, alto: 8001 }))).toBe('DIMENSIONES_NO_ADMITIDAS');
    expect(codigoDe(() => validarDimensiones({ ancho: 7000, alto: 7000 }))).toBe('DIMENSIONES_NO_ADMITIDAS');
  });

  it('una dimensión en cero o una cabecera ilegible → TIPO_NO_ADMITIDO', () => {
    expect(codigoDe(() => validarDimensiones({ ancho: 0, alto: 10 }))).toBe('TIPO_NO_ADMITIDO');
    expect(codigoDe(() => exigirDimensionesAdmitidas(JPG, 'jpg'))).toBe('TIPO_NO_ADMITIDO');
    expect(codigoDe(() => exigirDimensionesAdmitidas(pngCabecera(9000, 10), 'png'))).toBe(
      'DIMENSIONES_NO_ADMITIDAS',
    );
    expect(exigirDimensionesAdmitidas(pngCabecera(1200, 900), 'png')).toEqual({ ancho: 1200, alto: 900 });
  });

  it('el tamaño ajustado mantiene la proporción y nunca agranda', () => {
    expect(tamanioAjustado({ ancho: 1600, alto: 1200 }, 800)).toEqual({ ancho: 800, alto: 600 });
    expect(tamanioAjustado({ ancho: 1200, alto: 1600 }, 320)).toEqual({ ancho: 240, alto: 320 });
    expect(tamanioAjustado({ ancho: 300, alto: 200 }, 800)).toEqual({ ancho: 300, alto: 200 });
    expect(tamanioAjustado({ ancho: 1, alto: 5000 }, 800)).toEqual({ ancho: 1, alto: 800 });
  });
});

describe('DEC-06: miniatura', () => {
  it('la miniatura se llama <uuid>-m.<ext> y el formato público la admite', () => {
    expect(nombreDeMiniatura(ID(1), 'jpg')).toBe(`${ID(1)}-m.jpg`);
    expect(tipoDeNombreDeArchivo(`${ID(1)}-m.jpg`)).toBe('jpg');
    for (const malo of [`${ID(1)}-x.jpg`, `${ID(1)}--m.jpg`, `${ID(1)}-M.jpg`, `${ID(1)}-m`]) {
      expect([malo, tipoDeNombreDeArchivo(malo)]).toEqual([malo, null]);
    }
  });

  it('una imagen con miniatura expone sus dos archivos y rutas', () => {
    const conMiniatura = imagenConMiniatura(1);
    expect(conMiniatura.nombresArchivos).toEqual([`${ID(1)}.jpg`, `${ID(1)}-m.jpg`]);
    expect(conMiniatura.rutaMiniatura).toBe(`productos/${ID(1)}-m.jpg`);
    expect(conMiniatura.aPublico().nombreMiniatura).toBe(`${ID(1)}-m.jpg`);
  });

  it('una imagen anterior (sin miniatura) usa la misma imagen como miniatura', () => {
    const anterior = imagen(2, 0);
    expect(anterior.nombreMiniatura).toBeNull();
    expect(anterior.rutaMiniatura).toBeNull();
    expect(anterior.nombresArchivos).toEqual([`${ID(2)}.png`]);
    expect(anterior.aPublico().nombreMiniatura).toBe(`${ID(2)}.png`);
  });
});

describe('RF-PRO-01: principal, reordenar y compactar', () => {
  it('la principal es solo la de orden 0', () => {
    expect(imagen(1, 0).aPublico().principal).toBe(true);
    expect(imagen(2, 1).aPublico().principal).toBe(false);
  });

  it('reordena: la primera de la lista pasa a orden 0 (principal)', () => {
    const resultado = reordenarImagenes(
      [imagen(1, 0), imagen(2, 1), imagen(3, 2)],
      [ID(3), ID(1), ID(2)],
    );
    expect(resultado.map((i) => [i.id, i.orden])).toEqual([
      [ID(3), 0],
      [ID(1), 1],
      [ID(2), 2],
    ]);
  });

  it('exige todas las imágenes, sin repetir ni ajenas (DATOS_INVALIDOS)', () => {
    const actuales = [imagen(1, 0), imagen(2, 1)];
    for (const ids of [
      [ID(1)],
      [],
      [ID(1), ID(1)],
      [ID(1), ID(2), ID(3)],
      [ID(1), ID(9)],
    ]) {
      expect(codigoDe(() => reordenarImagenes(actuales, ids))).toBe(
        'DATOS_INVALIDOS',
      );
    }
  });

  it('compactar cierra el hueco que deja una imagen eliminada y reasigna la principal', () => {
    const resultado = compactarOrden([imagen(2, 1), imagen(3, 2)]);
    expect(resultado.map((i) => [i.id, i.orden])).toEqual([
      [ID(2), 0],
      [ID(3), 1],
    ]);
    expect(resultado[0].aPublico().principal).toBe(true);
  });
});
