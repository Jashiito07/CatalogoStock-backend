import {
  ConflictoError,
  ContenidoDemasiadoGrandeError,
  ContenidoNoAdmitidoError,
  ErrorDominio,
  NoEncontradoError,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';

/** La importación no existe (404 `NO_ENCONTRADO`). */
export class ImportacionNoEncontradaError extends NoEncontradoError {
  constructor() {
    super('La importación no existe.');
  }
}

/** El borrador no existe (404 `NO_ENCONTRADO`). */
export class BorradorNoEncontradoError extends NoEncontradoError {
  constructor() {
    super('El borrador no existe.');
  }
}

/** La marca indicada no existe (404 `MARCA_NO_ENCONTRADA`, D-48). */
export class MarcaNoEncontradaError extends ErrorDominio {
  readonly categoria = 'NO_ENCONTRADO';

  constructor() {
    super('MARCA_NO_ENCONTRADA', 'La marca no existe.');
  }
}

/** La marca está desactivada (422 `MARCA_INACTIVA`, D-48). */
export class MarcaInactivaError extends ReglaNegocioError {
  constructor() {
    super('MARCA_INACTIVA', 'La marca está desactivada.');
  }
}

/** El PDF supera 40 MB o 400 páginas (413 `ARCHIVO_DEMASIADO_GRANDE`, D-46). */
export class ArchivoDemasiadoGrandeError extends ContenidoDemasiadoGrandeError {
  constructor(mensaje: string) {
    super('ARCHIVO_DEMASIADO_GRANDE', mensaje);
  }
}

/** El contenido no empieza con la firma `%PDF-` (415 `FORMATO_NO_PERMITIDO`). */
export class FormatoNoPermitidoError extends ContenidoNoAdmitidoError {
  constructor() {
    super('FORMATO_NO_PERMITIDO', 'El archivo debe ser un PDF.');
  }
}

/** El PDF está cifrado, dañado, sin texto o sin productos reconocibles (422 `PDF_ILEGIBLE`). */
export class PdfIlegibleError extends ReglaNegocioError {
  constructor(mensaje: string) {
    super('PDF_ILEGIBLE', mensaje);
  }
}

/** La misma huella ya fue importada (409 `IMPORTACION_DUPLICADA`, con el id de la existente). */
export class ImportacionDuplicadaError extends ConflictoError {
  constructor(idImportacion: string) {
    super(
      'IMPORTACION_DUPLICADA',
      'Este PDF ya fue importado.',
      { idImportacion },
    );
  }
}

/** Solo un borrador `PENDIENTE` se puede editar (422 `BORRADOR_NO_EDITABLE`). */
export class BorradorNoEditableError extends ReglaNegocioError {
  constructor() {
    super(
      'BORRADOR_NO_EDITABLE',
      'Solo se puede editar un borrador pendiente.',
    );
  }
}
