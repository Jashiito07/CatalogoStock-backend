import {
  ConflictoError,
  NoEncontradoError,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';

/** Ya existe una marca con ese nombre (409 `MARCA_DUPLICADA`, RF-PRO-04). */
export class MarcaDuplicadaError extends ConflictoError {
  constructor() {
    super('MARCA_DUPLICADA', 'Ya existe una marca con ese nombre.');
  }
}

/** La marca no existe (404 `NO_ENCONTRADO`). */
export class MarcaNoEncontradaError extends NoEncontradoError {
  constructor() {
    super('La marca no existe.');
  }
}

/** Se intentó cambiar los colores de una marca conocida (422, D-56). */
export class ColorMarcaFijoError extends ReglaNegocioError {
  constructor() {
    super(
      'COLOR_MARCA_FIJO',
      'Los colores de una marca conocida no se pueden cambiar.',
    );
  }
}

/** Se intentó renombrar una marca conocida a otro nombre (422, D-56). */
export class NombreMarcaFijoError extends ReglaNegocioError {
  constructor() {
    super(
      'NOMBRE_MARCA_FIJO',
      'El nombre de una marca conocida no se puede cambiar.',
    );
  }
}
