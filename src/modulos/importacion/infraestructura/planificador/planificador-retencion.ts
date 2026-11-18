import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { EliminarImportacionesVencidasCasoUso } from '../../aplicacion/casos-uso/eliminar-importaciones-vencidas.caso-uso.js';

/** La retención se revisa al arrancar y luego cada 24 horas (D-57). */
export const INTERVALO_RETENCION_MS = 24 * 60 * 60 * 1000;

/**
 * Planificador interno de la retención de importaciones (D-57), **sin
 * dependencias nuevas**: ejecuta el caso de uso al arrancar el servidor y
 * luego cada 24 horas con un temporizador propio.
 *
 * - Desactivable (`activo = false`, variable `RETENCION_IMPORTACIONES_ACTIVA`):
 *   así las pruebas no lanzan borrados por su cuenta y llaman al caso de uso
 *   con un reloj controlado.
 * - Nunca interrumpe el arranque ni tumba el proceso: un error se registra sin
 *   datos y se reintenta en el siguiente ciclo.
 * - No se solapa consigo mismo; con varias instancias, el borrado condicional
 *   del caso de uso evita errores.
 */
export class PlanificadorRetencionImportaciones
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly registro = new Logger(PlanificadorRetencionImportaciones.name);
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private enEjecucion = false;

  constructor(
    private readonly retencion: EliminarImportacionesVencidasCasoUso,
    private readonly activo: boolean,
    private readonly intervaloMs: number = INTERVALO_RETENCION_MS,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.activo) {
      return;
    }
    void this.ejecutar();
    this.temporizador = setInterval(() => void this.ejecutar(), this.intervaloMs);
    // El temporizador no debe impedir que el proceso termine.
    this.temporizador.unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador !== null) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  /** Una pasada de la retención; nunca lanza. */
  async ejecutar(): Promise<void> {
    if (this.enEjecucion) {
      return;
    }
    this.enEjecucion = true;
    try {
      const { eliminadas, fallidas } = await this.retencion.ejecutar();
      if (eliminadas > 0 || fallidas > 0) {
        this.registro.log(
          `Retención de importaciones: ${eliminadas} eliminadas, ${fallidas} con error.`,
        );
      }
    } catch (error) {
      // Solo el tipo del error: nunca su mensaje ni datos.
      this.registro.warn(
        `La retención de importaciones no pudo ejecutarse (${error instanceof Error ? error.name : 'error'}).`,
      );
    } finally {
      this.enEjecucion = false;
    }
  }
}
