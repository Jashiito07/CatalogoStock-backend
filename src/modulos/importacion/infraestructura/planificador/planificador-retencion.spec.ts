import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EliminarImportacionesVencidasCasoUso,
  ResultadoRetencion,
} from '../../aplicacion/casos-uso/eliminar-importaciones-vencidas.caso-uso.js';
import {
  INTERVALO_RETENCION_MS,
  PlanificadorRetencionImportaciones,
} from './planificador-retencion.js';

/** Caso de uso falso: cuenta las llamadas y puede fallar o tardar. */
class RetencionFalsa {
  llamadas = 0;
  resultado: ResultadoRetencion = { eliminadas: 0, fallidas: 0 };
  error: Error | undefined = undefined;
  pendiente: Promise<void> | undefined = undefined;

  async ejecutar(): Promise<ResultadoRetencion> {
    this.llamadas++;
    if (this.pendiente !== undefined) {
      await this.pendiente;
    }
    if (this.error !== undefined) {
      throw this.error;
    }
    return this.resultado;
  }
}

describe('D-57: planificador interno de la retención (sin dependencias nuevas)', () => {
  let retencion: RetencionFalsa;

  const crear = (activo: boolean) =>
    new PlanificadorRetencionImportaciones(
      retencion as unknown as EliminarImportacionesVencidasCasoUso,
      activo,
    );

  beforeEach(() => {
    vi.useFakeTimers();
    retencion = new RetencionFalsa();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('desactivado (pruebas): no revisa al arrancar ni programa nada', async () => {
    const planificador = crear(false);

    planificador.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVALO_RETENCION_MS * 3);

    expect(retencion.llamadas).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('activo: revisa al arrancar y luego cada 24 horas', async () => {
    const planificador = crear(true);

    planificador.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(retencion.llamadas).toBe(1);

    await vi.advanceTimersByTimeAsync(INTERVALO_RETENCION_MS - 1);
    expect(retencion.llamadas).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(retencion.llamadas).toBe(2);
    await vi.advanceTimersByTimeAsync(INTERVALO_RETENCION_MS);
    expect(retencion.llamadas).toBe(3);

    planificador.onApplicationShutdown();
  });

  it('al apagar el servidor se cancela el temporizador', async () => {
    const planificador = crear(true);
    planificador.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    planificador.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(INTERVALO_RETENCION_MS * 2);

    expect(retencion.llamadas).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('un error de la retención no tumba el arranque ni cancela los ciclos siguientes, y el log no copia su mensaje', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const planificador = crear(true);
    retencion.error = new Error('la base no responde: usuario=secreto');

    expect(() => planificador.onApplicationBootstrap()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    retencion.error = undefined;
    await vi.advanceTimersByTimeAsync(INTERVALO_RETENCION_MS);

    expect(retencion.llamadas).toBe(2);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).not.toContain('secreto');
    planificador.onApplicationShutdown();
    aviso.mockRestore();
  });

  it('no se solapa consigo mismo: si la pasada anterior sigue en curso, la omite', async () => {
    const planificador = crear(true);
    const compuerta: { abrir: () => void } = { abrir: () => undefined };
    retencion.pendiente = new Promise<void>((resolver) => {
      compuerta.abrir = resolver;
    });

    planificador.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVALO_RETENCION_MS * 2);
    expect(retencion.llamadas).toBe(1);

    compuerta.abrir();
    await vi.advanceTimersByTimeAsync(INTERVALO_RETENCION_MS);
    expect(retencion.llamadas).toBe(2);
    planificador.onApplicationShutdown();
  });

  it('ejecutar() nunca lanza, aunque la retención falle', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    retencion.error = new Error('fallo');

    await expect(crear(false).ejecutar()).resolves.toBeUndefined();
  });
});
