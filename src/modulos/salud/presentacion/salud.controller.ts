import { Controller, Get, Inject } from '@nestjs/common';
import { ConsultarSaludCasoUso } from '../aplicacion/casos-uso/consultar-salud.caso-uso.js';
import type { EstadoBaseDatos } from '../dominio/estado-salud.js';

export interface RespuestaSalud {
  estado: 'ok';
  baseDatos: EstadoBaseDatos;
  /** ISO 8601 con zona horaria (UTC). */
  fecha: string;
}

/**
 * GET /api/v1/salud — público (no requiere autenticación).
 * Cuando exista el guard global de autenticación (F1) debe marcarse `@Publico()`.
 */
@Controller('salud')
export class SaludController {
  constructor(
    @Inject(ConsultarSaludCasoUso)
    private readonly consultarSalud: ConsultarSaludCasoUso,
  ) {}

  @Get()
  async consultar(): Promise<RespuestaSalud> {
    const salud = await this.consultarSalud.ejecutar();
    return {
      estado: salud.estado,
      baseDatos: salud.baseDatos,
      fecha: salud.fecha.toISOString(),
    };
  }
}
