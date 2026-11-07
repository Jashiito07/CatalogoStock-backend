import { Controller, Get, Inject } from '@nestjs/common';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import { ConsultarAvisoPrivacidadCasoUso } from '../../aplicacion/casos-uso/consultar-aviso-privacidad.caso-uso.js';
import {
  aRespuestaAviso,
  type RespuestaAvisoPrivacidad,
} from './respuestas.js';

/** Aviso de privacidad (RNF-16, D-11, D-15). */
@Controller('privacidad')
export class PrivacidadController {
  constructor(
    @Inject(ConsultarAvisoPrivacidadCasoUso)
    private readonly consultarAviso: ConsultarAvisoPrivacidadCasoUso,
  ) {}

  /** GET /api/v1/privacidad/aviso — público. */
  @Get('aviso')
  @Publico()
  obtenerAviso(): RespuestaAvisoPrivacidad {
    return aRespuestaAviso(this.consultarAviso.ejecutar());
  }
}
