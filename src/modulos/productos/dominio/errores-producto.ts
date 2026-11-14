import {
  NoEncontradoError,
  ReglaNegocioError,
} from '../../../compartido/dominio/errores.js';

/** El producto no existe o fue eliminado (404 `NO_ENCONTRADO`, PA-07). */
export class ProductoNoEncontradoError extends NoEncontradoError {
  constructor() {
    super('El producto no existe.');
  }
}

/** La marca indicada no existe (404 `NO_ENCONTRADO`). */
export class MarcaNoEncontradaError extends NoEncontradoError {
  constructor() {
    super('La marca no existe.');
  }
}

/** No se puede asignar un producto a una marca desactivada (422 `MARCA_INACTIVA`, RF-PRO-04). */
export class MarcaInactivaError extends ReglaNegocioError {
  constructor() {
    super('MARCA_INACTIVA', 'La marca está desactivada.');
  }
}
