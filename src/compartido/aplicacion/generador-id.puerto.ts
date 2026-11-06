/** Puerto para generar identificadores UUID; permite ids deterministas en las pruebas. */
export interface GeneradorId {
  generar(): string;
}

export const GENERADOR_ID = Symbol('GENERADOR_ID');
