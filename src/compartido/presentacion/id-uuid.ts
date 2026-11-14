import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { MENSAJES_HTTP, type RespuestaError } from './respuesta-error.js';

export const MENSAJE_ID_NO_UUID = 'El identificador debe ser un UUID.';

/** `{id}` que no es un UUID → 400 `DATOS_INVALIDOS` con el formato del contrato. */
export const idUuid = new ParseUUIDPipe({
  exceptionFactory: () => {
    const cuerpo: RespuestaError = {
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_HTTP[400],
      detalles: { errores: [{ campo: 'id', errores: [MENSAJE_ID_NO_UUID] }] },
    };
    return new BadRequestException(cuerpo);
  },
});
