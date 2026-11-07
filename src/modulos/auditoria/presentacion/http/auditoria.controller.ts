import { Controller, Get, Inject, Query } from '@nestjs/common';
import { paginacionDe } from '../../../../compartido/presentacion/paginacion.dto.js';
import { Roles } from '../../../usuarios/index.js';
import { ConsultarBitacoraCasoUso } from '../../aplicacion/casos-uso/consultar-bitacora.caso-uso.js';
import { ConsultaBitacoraDto } from './dto/consulta-bitacora.dto.js';
import {
  aRespuestaPaginaBitacora,
  type RespuestaPaginaBitacora,
} from './respuestas.js';

/** Bitácora de actividades (contrato de auditoría). Solo lectura. */
@Controller('auditoria')
export class AuditoriaController {
  constructor(
    @Inject(ConsultarBitacoraCasoUso)
    private readonly consultarBitacora: ConsultarBitacoraCasoUso,
  ) {}

  /**
   * GET /api/v1/auditoria — solo el Vendedor (RF-USU-04, RF-USU-03, CA-02).
   * Un Cliente recibe 403 `NO_AUTORIZADO` del guard global de roles, que
   * además registra `ACCESO_DENEGADO` (D-18); sin token, 401.
   */
  @Get()
  @Roles('VENDEDOR')
  async consultar(
    @Query() consulta: ConsultaBitacoraDto,
  ): Promise<RespuestaPaginaBitacora> {
    return aRespuestaPaginaBitacora(
      await this.consultarBitacora.ejecutar(
        {
          accion: consulta.accion,
          idUsuario: consulta.idUsuario,
          entidad: consulta.entidad,
          idEntidad: consulta.idEntidad,
          desde:
            consulta.desde === undefined ? undefined : new Date(consulta.desde),
          hasta:
            consulta.hasta === undefined ? undefined : new Date(consulta.hasta),
        },
        paginacionDe(consulta),
      ),
    );
  }
}
