import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { Mock } from 'vitest';
import {
  ConexionBaseDatosServicio,
  describirError,
} from './conexion-base-datos.servicio.js';

describe('describirError: log de conexión sin datos sensibles', () => {
  it('incluye el código técnico, no el mensaje', () => {
    const error = Object.assign(
      new Error('connect ECONNREFUSED 10.0.0.5:5432 usuario=admin'),
      { code: 'ECONNREFUSED' },
    );
    expect(describirError(error)).toBe('Error ECONNREFUSED');
  });

  it('ignora códigos con formato inesperado', () => {
    const error = Object.assign(new Error('x'), { code: 'clave secreta' });
    expect(describirError(error)).toBe('Error');
    expect(describirError('texto')).toBe('Error');
  });
});

interface FuenteDatosFalsa {
  isInitialized: boolean;
  initialize: Mock<() => Promise<FuenteDatosFalsa>>;
  destroy: Mock<() => Promise<void>>;
}

function crearFuenteDatos(fallosAntesDeConectar: number): FuenteDatosFalsa {
  let fallos = 0;
  const fuente: FuenteDatosFalsa = {
    isInitialized: false,
    initialize: vi.fn<() => Promise<FuenteDatosFalsa>>(() => {
      if (fallos < fallosAntesDeConectar) {
        fallos += 1;
        return Promise.reject(new Error('ECONNREFUSED clave=secreta'));
      }
      fuente.isInitialized = true;
      return Promise.resolve(fuente);
    }),
    destroy: vi.fn<() => Promise<void>>(() => {
      fuente.isInitialized = false;
      return Promise.resolve();
    }),
  };
  return fuente;
}

const OPCIONES = { reintentos: 3, esperaMs: 1000 };

describe('ConexionBaseDatosServicio: la API arranca aunque PostgreSQL no esté disponible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('el arranque no espera a la conexión (no bloquea)', () => {
    const fuente = crearFuenteDatos(0);
    const servicio = new ConexionBaseDatosServicio(
      fuente as unknown as DataSource,
      OPCIONES,
    );

    servicio.onApplicationBootstrap();

    expect(fuente.initialize).not.toHaveBeenCalled();
  });

  it('reintenta hasta conectar', async () => {
    const fuente = crearFuenteDatos(2);
    const servicio = new ConexionBaseDatosServicio(
      fuente as unknown as DataSource,
      OPCIONES,
    );

    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(OPCIONES.esperaMs * 2);

    expect(fuente.initialize).toHaveBeenCalledTimes(3);
    expect(fuente.isInitialized).toBe(true);
  });

  it('deja de reintentar al agotar los intentos, sin lanzar ni exponer secretos en el log', async () => {
    const fuente = crearFuenteDatos(Number.POSITIVE_INFINITY);
    const servicio = new ConexionBaseDatosServicio(
      fuente as unknown as DataSource,
      OPCIONES,
    );

    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(OPCIONES.esperaMs * 10);

    expect(fuente.initialize).toHaveBeenCalledTimes(OPCIONES.reintentos);
    expect(fuente.isInitialized).toBe(false);
    const mensajes = [
      ...vi.mocked(Logger.prototype.warn).mock.calls,
      ...vi.mocked(Logger.prototype.error).mock.calls,
    ]
      .flat()
      .join(' ');
    expect(mensajes).not.toContain('secreta');
    expect(mensajes).not.toContain('ECONNREFUSED');
  });

  it('al detener la aplicación cancela los reintentos pendientes', async () => {
    const fuente = crearFuenteDatos(1);
    const servicio = new ConexionBaseDatosServicio(
      fuente as unknown as DataSource,
      OPCIONES,
    );

    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await servicio.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(OPCIONES.esperaMs * 10);

    expect(fuente.initialize).toHaveBeenCalledTimes(1);
    expect(fuente.destroy).not.toHaveBeenCalled();
  });

  it('al detener la aplicación con conexión abierta la cierra', async () => {
    const fuente = crearFuenteDatos(0);
    const servicio = new ConexionBaseDatosServicio(
      fuente as unknown as DataSource,
      OPCIONES,
    );

    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await servicio.onApplicationShutdown();

    expect(fuente.destroy).toHaveBeenCalledTimes(1);
  });
});
