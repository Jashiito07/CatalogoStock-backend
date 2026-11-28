import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ErrorDominio } from '../../../../compartido/dominio/errores.js';
import { ProcesadorImagenesCanvas } from './procesador-imagenes.canvas.js';

/**
 * Pruebas del adaptador real (DEC-04, DEC-06) con `@napi-rs/canvas`: tamaños,
 * orientación de la foto, metadatos eliminados y fondo de las transparentes.
 */

/** Imagen de dos colores: izquierda roja y derecha azul. */
async function imagenPrueba(
  ancho: number,
  alto: number,
  formato: 'png' | 'jpeg' | 'webp' = 'png',
): Promise<Buffer> {
  const lienzo = createCanvas(ancho, alto);
  const contexto = lienzo.getContext('2d');
  contexto.fillStyle = '#FF0000';
  contexto.fillRect(0, 0, ancho / 2, alto);
  contexto.fillStyle = '#0000FF';
  contexto.fillRect(ancho / 2, 0, ancho / 2, alto);
  return formato === 'png'
    ? lienzo.encode('png')
    : lienzo.encode(formato, 90);
}

/**
 * Inserta un bloque EXIF (APP1) justo después del SOI de un JPEG: orientación
 * (0x0112) y una descripción (0x010E) que simula datos privados (GPS).
 */
function conExif(jpeg: Buffer, orientacion: number, texto: string): Buffer {
  const ascii = Buffer.from(`${texto}\0`, 'latin1');
  const tiff = Buffer.alloc(8 + 2 + 24 + 4);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  // Orientación: SHORT, 1 valor.
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientacion, 18);
  // Descripción: ASCII, datos al final del bloque.
  tiff.writeUInt16LE(0x010e, 22);
  tiff.writeUInt16LE(2, 24);
  tiff.writeUInt32LE(ascii.length, 26);
  tiff.writeUInt32LE(tiff.length, 30);
  tiff.writeUInt32LE(0, 34);
  const datos = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, ascii]);
  const segmento = Buffer.alloc(4);
  segmento.writeUInt16BE(0xffe1, 0);
  segmento.writeUInt16BE(datos.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), segmento, datos, jpeg.subarray(2)]);
}

async function pixel(contenido: Uint8Array, x: number, y: number): Promise<number[]> {
  const imagen = await loadImage(Buffer.from(contenido));
  const lienzo = createCanvas(imagen.width, imagen.height);
  const contexto = lienzo.getContext('2d');
  contexto.drawImage(imagen, 0, 0);
  return Array.from(contexto.getImageData(x, y, 1, 1).data.subarray(0, 3));
}

const esJpeg = (contenido: Uint8Array) =>
  contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff;

const cerca = (real: number[], esperado: number[]) =>
  real.every((valor, i) => Math.abs(valor - esperado[i]) <= 40);

describe('ProcesadorImagenesCanvas (DEC-06)', () => {
  const procesador = new ProcesadorImagenesCanvas();

  it('reduce a 800 px (detalle) y 320 px (miniatura) manteniendo la proporción, en JPEG', async () => {
    const resultado = await procesador.procesar(await imagenPrueba(1600, 1200));

    expect(resultado.detalle).toMatchObject({ ancho: 800, alto: 600 });
    expect(resultado.miniatura).toMatchObject({ ancho: 320, alto: 240 });
    expect(esJpeg(resultado.detalle.contenido)).toBe(true);
    expect(esJpeg(resultado.miniatura.contenido)).toBe(true);
    const detalle = await loadImage(Buffer.from(resultado.detalle.contenido));
    expect([detalle.width, detalle.height]).toEqual([800, 600]);
    expect(resultado.miniatura.contenido.length).toBeLessThan(
      resultado.detalle.contenido.length,
    );
  });

  it('no agranda una imagen pequeña y acepta JPEG y WebP de entrada', async () => {
    for (const formato of ['jpeg', 'webp'] as const) {
      const resultado = await procesador.procesar(
        await imagenPrueba(300, 200, formato),
      );
      expect(resultado.detalle).toMatchObject({ ancho: 300, alto: 200 });
      expect(resultado.miniatura).toMatchObject({ ancho: 300, alto: 200 });
    }
  });

  it('aplica la orientación de la foto (EXIF 6 = girada 90°) y quita todos los metadatos', async () => {
    const foto = conExif(
      await imagenPrueba(300, 200, 'jpeg'),
      6,
      'GPS-FICTICIO -0.9536,-80.7286',
    );
    expect(foto.includes('GPS-FICTICIO')).toBe(true);

    const resultado = await procesador.procesar(foto);

    // Horizontal de 300×200 girada → vertical de 200×300, con el rojo arriba.
    expect(resultado.detalle).toMatchObject({ ancho: 200, alto: 300 });
    expect(cerca(await pixel(resultado.detalle.contenido, 100, 10), [255, 0, 0])).toBe(true);
    for (const version of [resultado.detalle, resultado.miniatura]) {
      const salida = Buffer.from(version.contenido);
      expect(salida.includes('Exif')).toBe(false);
      expect(salida.includes('GPS-FICTICIO')).toBe(false);
    }
  });

  it('las zonas transparentes de un PNG quedan blancas (JPEG no tiene transparencia)', async () => {
    const lienzo = createCanvas(100, 100);
    const contexto = lienzo.getContext('2d');
    contexto.fillStyle = '#00FF00';
    contexto.fillRect(0, 0, 50, 100);
    const resultado = await procesador.procesar(await lienzo.encode('png'));

    expect(cerca(await pixel(resultado.detalle.contenido, 10, 50), [0, 255, 0])).toBe(true);
    expect(cerca(await pixel(resultado.detalle.contenido, 90, 50), [255, 255, 255])).toBe(true);
  });

  it('una imagen dañada (firma correcta, datos rotos) → TIPO_NO_ADMITIDO', async () => {
    const rota = Buffer.concat([
      (await imagenPrueba(50, 50)).subarray(0, 40),
      Buffer.alloc(200, 0x41),
    ]);
    const error = await procesador.procesar(rota).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorDominio);
    expect((error as ErrorDominio).codigo).toBe('TIPO_NO_ADMITIDO');
  });

  it('procesa varias a la vez respetando el máximo de simultáneas', async () => {
    const uno = new ProcesadorImagenesCanvas(1);
    const entrada = await imagenPrueba(400, 300);

    const resultados = await Promise.all(
      Array.from({ length: 4 }, () => uno.procesar(entrada)),
    );

    expect(resultados.map((r) => r.detalle.ancho)).toEqual([400, 400, 400, 400]);
  });
});
