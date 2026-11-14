/**
 * Errores de dominio base. TypeScript puro: sin NestJS ni HTTP.
 * El filtro global (compartido/presentacion/filtro-errores.ts) traduce la
 * categoría a un código HTTP y responde `{ codigo, mensaje, detalles }`.
 */
export type CategoriaErrorDominio =
  | 'DATOS_INVALIDOS'
  | 'NO_AUTENTICADO'
  | 'NO_AUTORIZADO'
  | 'NO_ENCONTRADO'
  | 'CONFLICTO'
  | 'REGLA_NEGOCIO'
  | 'CONTENIDO_DEMASIADO_GRANDE'
  | 'CONTENIDO_NO_ADMITIDO';

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

/**
 * No se pudo comprobar la identidad de quien llama (HTTP 401): credenciales
 * incorrectas, token ausente, vencido o inválido. Cada caso usa su código
 * (`CREDENCIALES_INVALIDAS`, `NO_AUTENTICADO`, `TOKEN_VENCIDO`, `TOKEN_INVALIDO`).
 */
export class NoAutenticadoError extends ErrorDominio {
  readonly categoria = 'NO_AUTENTICADO';
}

export const MENSAJE_NO_AUTORIZADO =
  'No tiene permiso para realizar esta acción.';

/**
 * La identidad es válida, pero su rol no tiene permiso para la operación
 * (HTTP 403 `NO_AUTORIZADO`, RF-USU-03, CA-02). Mensaje único: no revela qué
 * rol haría falta.
 */
export class NoAutorizadoError extends ErrorDominio {
  readonly categoria = 'NO_AUTORIZADO';

  constructor() {
    super('NO_AUTORIZADO', MENSAJE_NO_AUTORIZADO);
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

/** Un archivo supera el tamaño permitido (HTTP 413, p. ej. `ARCHIVO_DEMASIADO_GRANDE`). */
export class ContenidoDemasiadoGrandeError extends ErrorDominio {
  readonly categoria = 'CONTENIDO_DEMASIADO_GRANDE';
}

/** El contenido real de un archivo no es de un tipo admitido (HTTP 415, p. ej. `TIPO_NO_ADMITIDO`). */
export class ContenidoNoAdmitidoError extends ErrorDominio {
  readonly categoria = 'CONTENIDO_NO_ADMITIDO';
}
