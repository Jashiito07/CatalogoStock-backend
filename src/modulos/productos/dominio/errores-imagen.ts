import {
  ContenidoDemasiadoGrandeError,
  ContenidoNoAdmitidoError,
  NoEncontradoError,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';

/** La imagen no existe en ese producto (404 `NO_ENCONTRADO`). */
export class ImagenNoEncontradaError extends NoEncontradoError {
  constructor() {
    super('La imagen no existe.');
  }
}

/** La imagen supera 2 MB (413 `ARCHIVO_DEMASIADO_GRANDE`, D-46). */
export class ArchivoDemasiadoGrandeError extends ContenidoDemasiadoGrandeError {
  constructor() {
    super('ARCHIVO_DEMASIADO_GRANDE', 'La imagen no puede superar los 2 MB.');
  }
}

/** El contenido no es JPG, PNG ni WebP (415 `TIPO_NO_ADMITIDO`, D-46). */
export class TipoNoAdmitidoError extends ContenidoNoAdmitidoError {
  constructor() {
    super('TIPO_NO_ADMITIDO', 'La imagen debe ser JPG, PNG o WebP.');
  }
}

/** El producto ya tiene 5 imágenes (422 `LIMITE_IMAGENES`, D-46). */
export class LimiteImagenesError extends ReglaNegocioError {
  constructor() {
    super('LIMITE_IMAGENES', 'Un producto admite como máximo 5 imágenes.');
  }
}
