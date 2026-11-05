/** Formato único de error del contrato de API (docs/contrato-api/README.md). */
export interface RespuestaError {
  codigo: string;
  mensaje: string;
  detalles: Record<string, unknown>;
}

/** Códigos genéricos por estado HTTP. */
export const CODIGOS_HTTP: Readonly<Record<number, string>> = {
  400: 'DATOS_INVALIDOS',
  401: 'NO_AUTENTICADO',
  403: 'NO_AUTORIZADO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  413: 'ARCHIVO_DEMASIADO_GRANDE',
  415: 'TIPO_NO_ADMITIDO',
  422: 'REGLA_NEGOCIO',
  429: 'DEMASIADAS_SOLICITUDES',
  500: 'ERROR_INTERNO',
};

/** Mensajes genéricos en español (los de NestJS vienen en inglés). */
export const MENSAJES_HTTP: Readonly<Record<number, string>> = {
  400: 'Los datos enviados no son válidos.',
  401: 'Debe iniciar sesión para continuar.',
  403: 'No tiene permiso para realizar esta acción.',
  404: 'El recurso solicitado no existe.',
  409: 'La operación entra en conflicto con el estado actual.',
  413: 'El contenido enviado supera el tamaño permitido.',
  415: 'El tipo de contenido no está admitido.',
  422: 'La operación no cumple una regla de negocio.',
  429: 'Demasiadas solicitudes. Intente más tarde.',
  500: 'Ocurrió un error interno. Intente más tarde.',
};

export const CODIGO_SOLICITUD_RECHAZADA = 'SOLICITUD_RECHAZADA';
export const MENSAJE_SOLICITUD_RECHAZADA = 'La solicitud no pudo procesarse.';
