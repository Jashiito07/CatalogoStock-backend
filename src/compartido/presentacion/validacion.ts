import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { MENSAJES_HTTP, type RespuestaError } from './respuesta-error.js';

export interface ErrorCampo {
  campo: string;
  errores: string[];
}

/** Aplana los errores de class-validator, incluidos los anidados ("lineas.0.cantidad"). */
export function aplanarErroresValidacion(
  errores: ValidationError[],
  prefijo = '',
): ErrorCampo[] {
  return errores.flatMap((error) => {
    const campo = prefijo ? `${prefijo}.${error.property}` : error.property;
    // Sin mensajes repetidos: varias reglas pueden compartir el mismo texto.
    const propios: ErrorCampo[] = error.constraints
      ? [{ campo, errores: [...new Set(Object.values(error.constraints))] }]
      : [];
    return [
      ...propios,
      ...aplanarErroresValidacion(error.children ?? [], campo),
    ];
  });
}

/**
 * ValidationPipe global (RNF-03): descarta y rechaza campos no declarados,
 * transforma tipos y responde 400 DATOS_INVALIDOS sin eco de los valores
 * enviados (pueden contener datos personales).
 */
export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errores: ValidationError[]) => {
      const cuerpo: RespuestaError = {
        codigo: 'DATOS_INVALIDOS',
        mensaje: MENSAJES_HTTP[400],
        detalles: { errores: aplanarErroresValidacion(errores) },
      };
      return new BadRequestException(cuerpo);
    },
  });
}
