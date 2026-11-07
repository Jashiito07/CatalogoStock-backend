import { Controller, Get, Inject } from '@nestjs/common';
import { Publico } from '../../../compartido/presentacion/publico.js';
import { ConsultarSaludCasoUso } from '../aplicacion/casos-uso/consultar-salud.caso-uso.js';
import type { EstadoBaseDatos } from '../dominio/estado-salud.js';

export interface RespuestaSalud {
  estado: 'ok';
  baseDatos: EstadoBaseDatos;
  /** ISO 8601 con zona horaria (UTC). */
  fecha: string;
}

/**
 * GET /api/v1/salud — público (no requiere autenticación): `@Publico()` lo
 * excluye del guard global de autenticación (subfase 1.4).
 */
@Controller('salud')
export class SaludController {
  constructor(
    @Inject(ConsultarSaludCasoUso)
    private readonly consultarSalud: ConsultarSaludCasoUso,
  ) {}

  @Get()
  @Publico()
  async consultar(): Promise<RespuestaSalud> {
    const salud = await this.consultarSalud.ejecutar();
    return {
      estado: salud.estado,
      baseDatos: salud.baseDatos,
      fecha: salud.fecha.toISOString(),
    };
  }
}
