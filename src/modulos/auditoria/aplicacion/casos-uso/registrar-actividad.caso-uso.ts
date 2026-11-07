import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import { RegistroActividad } from '../../dominio/registro-actividad.js';
import type { RegistroActividadRepositorio } from '../puertos/registro-actividad.repositorio.js';
import type { RegistroTecnico } from '../puertos/registro-tecnico.puerto.js';
import type {
  RegistrarActividad,
  ServicioAuditoria,
} from '../servicio-auditoria.js';

/** Nombre de la clase del error, sin su mensaje (puede llevar valores de la consulta). */
function claseDeError(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * Servicio público de la bitácora (RF-USU-04, contrato de auditoría). El id y
 * la fecha los asigna el servidor; el detalle pasa por la salvaguarda del
 * dominio antes de guardarse.
 */
export class RegistrarActividadCasoUso implements ServicioAuditoria {
  constructor(
    private readonly registros: RegistroActividadRepositorio,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly registroTecnico: RegistroTecnico,
  ) {}

  async registrar(actividad: RegistrarActividad): Promise<void> {
    await this.registros.guardar(this.crear(actividad));
  }

  async registrarSinInterrumpir(actividad: RegistrarActividad): Promise<void> {
    try {
      await this.registros.guardarFueraDeTransaccion(this.crear(actividad));
    } catch (error) {
      this.registroTecnico.error(
        `No se pudo registrar ${String(actividad.accion)} en la bitácora (${claseDeError(error)}).`,
      );
    }
  }

  private crear(actividad: RegistrarActividad): RegistroActividad {
    const { registro, descartados } = RegistroActividad.crear({
      id: this.generadorId.generar(),
      fecha: this.reloj.ahora(),
      accion: actividad.accion,
      idUsuario: actividad.idUsuario,
      entidad: actividad.entidad,
      idEntidad: actividad.idEntidad,
      detalle: actividad.detalle,
    });
    if (descartados.length > 0) {
      this.registroTecnico.advertir(
        `Se descartaron campos no permitidos del detalle de ${registro.accion}: ${descartados.join(', ')}.`,
      );
    }
    return registro;
  }
}
