import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  type CategoriaErrorDominio,
  ErrorDominio,
} from '../dominio/errores.js';
import {
  CODIGO_SOLICITUD_RECHAZADA,
  CODIGOS_HTTP,
  MENSAJE_SOLICITUD_RECHAZADA,
  MENSAJES_HTTP,
  type RespuestaError,
} from './respuesta-error.js';

const ESTADO_POR_CATEGORIA: Readonly<Record<CategoriaErrorDominio, number>> = {
  DATOS_INVALIDOS: HttpStatus.BAD_REQUEST,
  NO_ENCONTRADO: HttpStatus.NOT_FOUND,
  CONFLICTO: HttpStatus.CONFLICT,
  REGLA_NEGOCIO: HttpStatus.UNPROCESSABLE_ENTITY,
};

interface Resultado {
  estado: number;
  cuerpo: RespuestaError;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function errorInterno(): Resultado {
  return {
    estado: HttpStatus.INTERNAL_SERVER_ERROR,
    cuerpo: {
      codigo: CODIGOS_HTTP[500],
      mensaje: MENSAJES_HTTP[500],
      detalles: {},
    },
  };
}

function respuestaGenerica(estado: number): Resultado {
  return {
    estado,
    cuerpo: {
      codigo: CODIGOS_HTTP[estado] ?? CODIGO_SOLICITUD_RECHAZADA,
      mensaje: MENSAJES_HTTP[estado] ?? MENSAJE_SOLICITUD_RECHAZADA,
      detalles: {},
    },
  };
}

/**
 * Traduce cualquier excepción al formato `{ codigo, mensaje, detalles }`.
 *
 * - Errores de dominio: su código, mensaje y detalles, con el estado HTTP de su categoría.
 * - HttpException 4xx: si el cuerpo ya trae `codigo` y `mensaje` se respeta;
 *   si no, se usa el código y el mensaje genérico en español del estado.
 * - Cualquier otro error (o 5xx): 500 ERROR_INTERNO sin detalles internos.
 *   Solo se registra en el log el método, la ruta sin parámetros de consulta
 *   y la traza; nunca el cuerpo, cabeceras ni tokens.
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger('FiltroErrores');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const respuesta = http.getResponse<Response>();
    const solicitud = http.getRequest<Request>();

    const resultado = this.resolver(excepcion);
    if (resultado.estado >= 500) {
      const traza = excepcion instanceof Error ? excepcion.stack : undefined;
      this.logger.error(
        `Error no controlado en ${solicitud.method} ${solicitud.path}`,
        traza,
      );
    }
    respuesta.status(resultado.estado).json(resultado.cuerpo);
  }

  resolver(excepcion: unknown): Resultado {
    if (excepcion instanceof ErrorDominio) {
      return {
        estado: ESTADO_POR_CATEGORIA[excepcion.categoria],
        cuerpo: {
          codigo: excepcion.codigo,
          mensaje: excepcion.message,
          detalles: excepcion.detalles ?? {},
        },
      };
    }

    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      if (estado >= 500) {
        return errorInterno();
      }
      const cuerpo = excepcion.getResponse();
      if (
        esObjeto(cuerpo) &&
        typeof cuerpo.codigo === 'string' &&
        typeof cuerpo.mensaje === 'string'
      ) {
        return {
          estado,
          cuerpo: {
            codigo: cuerpo.codigo,
            mensaje: cuerpo.mensaje,
            detalles: esObjeto(cuerpo.detalles) ? cuerpo.detalles : {},
          },
        };
      }
      return respuestaGenerica(estado);
    }

    // Errores 4xx de Express (p. ej. JSON mal formado de body-parser).
    if (
      esObjeto(excepcion) &&
      typeof excepcion.status === 'number' &&
      excepcion.status >= 400 &&
      excepcion.status < 500 &&
      excepcion.expose === true
    ) {
      return respuestaGenerica(excepcion.status);
    }

    return errorInterno();
  }
}
