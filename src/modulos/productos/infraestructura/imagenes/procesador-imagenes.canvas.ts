import { createCanvas, type Image, loadImage } from '@napi-rs/canvas';
import type {
  ImagenProcesada,
  ProcesadorImagenes,
  VersionImagen,
} from '../../aplicacion/puertos/procesador-imagenes.puerto.js';
import { ImagenIlegibleError } from '../../dominio/errores-imagen.js';
import {
  CALIDAD_DETALLE,
  CALIDAD_MINIATURA,
  LADO_DETALLE,
  LADO_MINIATURA,
  tamanioAjustado,
  validarDimensiones,
} from '../../dominio/imagen.js';

/** Fondo para las imágenes con transparencia: JPEG no tiene canal alfa. */
const FONDO = '#FFFFFF';

/**
 * Adaptador de ProcesadorImagenes con `@napi-rs/canvas` (Skia, DEC-04).
 *
 * - `loadImage` aplica la orientación EXIF de la foto (comprobado con la 1.1.1)
 *   y la nueva codificación JPEG no lleva metadatos: así se quitan el GPS y los
 *   datos del teléfono (DEC-06).
 * - Como máximo `simultaneos` imágenes se decodifican a la vez: una imagen de
 *   40 MP ocupa unos 160 MB al decodificarse y el servidor puede ser pequeño.
 * - Las dimensiones ya se validaron en la cabecera; aquí se vuelven a validar
 *   con las reales, por si la cabecera mentía.
 */
export class ProcesadorImagenesCanvas implements ProcesadorImagenes {
  private enCurso = 0;
  private readonly enEspera: Array<() => void> = [];

  constructor(private readonly simultaneos = 2) {}

  async procesar(contenido: Uint8Array): Promise<ImagenProcesada> {
    await this.ocupar();
    try {
      const imagen = await this.decodificar(contenido);
      validarDimensiones({ ancho: imagen.width, alto: imagen.height });
      const detalle = await this.version(imagen, LADO_DETALLE, CALIDAD_DETALLE);
      const miniatura = await this.version(
        imagen,
        LADO_MINIATURA,
        CALIDAD_MINIATURA,
      );
      return { detalle, miniatura };
    } finally {
      this.liberar();
    }
  }

  private async decodificar(contenido: Uint8Array): Promise<Image> {
    try {
      return await loadImage(
        Buffer.from(contenido.buffer, contenido.byteOffset, contenido.byteLength),
      );
    } catch {
      throw new ImagenIlegibleError();
    }
  }

  private async version(
    imagen: Image,
    ladoMaximo: number,
    calidad: number,
  ): Promise<VersionImagen> {
    const { ancho, alto } = tamanioAjustado(
      { ancho: imagen.width, alto: imagen.height },
      ladoMaximo,
    );
    const lienzo = createCanvas(ancho, alto);
    const contexto = lienzo.getContext('2d');
    contexto.fillStyle = FONDO;
    contexto.fillRect(0, 0, ancho, alto);
    contexto.imageSmoothingEnabled = true;
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(imagen, 0, 0, ancho, alto);
    const codificada = await lienzo.encode('jpeg', calidad);
    return { contenido: new Uint8Array(codificada), ancho, alto };
  }

  private ocupar(): Promise<void> {
    if (this.enCurso < this.simultaneos) {
      this.enCurso++;
      return Promise.resolve();
    }
    return new Promise((resolver) => {
      this.enEspera.push(() => {
        this.enCurso++;
        resolver();
      });
    });
  }

  private liberar(): void {
    this.enCurso--;
    this.enEspera.shift()?.();
  }
}
