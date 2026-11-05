import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import {
  crearEstadoSalud,
  type EstadoSalud,
} from '../../dominio/estado-salud.js';
import type { ComprobadorBaseDatos } from '../puertos/comprobador-base-datos.puerto.js';

/**
 * Consulta el estado de salud de la API (PLAN F0: "la API responde a /salud").
 * No conoce HTTP ni TypeORM: depende solo de sus puertos.
 */
export class ConsultarSaludCasoUso {
  constructor(
    private readonly comprobadorBaseDatos: ComprobadorBaseDatos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(): Promise<EstadoSalud> {
    let disponible: boolean;
    try {
      disponible = await this.comprobadorBaseDatos.estaDisponible();
    } catch {
      // Un adaptador defectuoso no debe convertir /salud en un error 500.
      disponible = false;
    }
    return crearEstadoSalud(disponible, this.reloj.ahora());
  }
}
