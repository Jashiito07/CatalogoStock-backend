/**
 * Errores de dominio base. TypeScript puro: sin NestJS ni HTTP.
 * El filtro global (compartido/presentacion/filtro-errores.ts) traduce la
 * categoría a un código HTTP y responde `{ codigo, mensaje, detalles }`.
 */
export type CategoriaErrorDominio =
  'DATOS_INVALIDOS' | 'NO_ENCONTRADO' | 'CONFLICTO' | 'REGLA_NEGOCIO';

export type DetallesError = Record<string, unknown>;

export abstract class ErrorDominio extends Error {
  abstract readonly categoria: CategoriaErrorDominio;

  constructor(
    /** Código estable para el cliente, por ejemplo `STOCK_INSUFICIENTE`. */
    readonly codigo: string,
    mensaje: string,
    /** Información adicional segura de mostrar (nunca datos sensibles). */
    readonly detalles?: DetallesError,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/** Datos que no cumplen una regla de formato o rango (HTTP 400). */
export class DatosInvalidosError extends ErrorDominio {
  readonly categoria = 'DATOS_INVALIDOS';

  constructor(mensaje: string, detalles?: DetallesError) {
    super('DATOS_INVALIDOS', mensaje, detalles);
  }
}

/** El recurso no existe o no pertenece al usuario (HTTP 404). */
export class NoEncontradoError extends ErrorDominio {
  readonly categoria = 'NO_ENCONTRADO';

  constructor(mensaje: string, detalles?: DetallesError) {
    super('NO_ENCONTRADO', mensaje, detalles);
  }
}

/** Conflicto con el estado oficial, p. ej. `STOCK_INSUFICIENTE` (HTTP 409). */
export class ConflictoError extends ErrorDominio {
  readonly categoria = 'CONFLICTO';
}

/** Una regla de negocio impide la operación, p. ej. `TRANSICION_NO_PERMITIDA` (HTTP 422). */
export class ReglaNegocioError extends ErrorDominio {
  readonly categoria = 'REGLA_NEGOCIO';
}
