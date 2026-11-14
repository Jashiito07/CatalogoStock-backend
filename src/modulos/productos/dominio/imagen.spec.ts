import { ErrorDominio } from '../../../compartido/dominio/errores.js';
import {
  compactarOrden,
  detectarTipoImagen,
  exigirCupoDeImagenes,
  Imagen,
  MAXIMO_IMAGENES_POR_PRODUCTO,
  nombreDeArchivo,
  reordenarImagenes,
  TAMANIO_MAXIMO_IMAGEN_BYTES,
  tipoDeNombreDeArchivo,
  validarArchivoImagen,
} from './imagen.js';

const ID_PRODUCTO = '00000000-0000-4000-8000-0000000000a1';
const ID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AHORA = new Date('2026-11-12T10:00:00.000Z');

const imagen = (n: number, orden: number) =>
  Imagen.reconstituir({
    id: ID(n),
    productoId: ID_PRODUCTO,
    orden,
    tipo: 'png',
    tamanioBytes: 100,
    creadaEn: AHORA,
  });

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
