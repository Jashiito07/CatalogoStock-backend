import {
  ConflictoError,
  NoEncontradoError,
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
