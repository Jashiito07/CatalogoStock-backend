import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ESPERA_ENTRE_REINTENTOS_MS,
  REINTENTOS_CONEXION,
} from './base-datos.config.js';

/** Opciones de reintento; se inyectan para poder probarlas sin esperas reales. */
export const OPCIONES_CONEXION_BASE_DATOS = Symbol(
  'OPCIONES_CONEXION_BASE_DATOS',
);

export interface OpcionesConexionBaseDatos {
  reintentos: number;
  esperaMs: number;
}

export const OPCIONES_CONEXION_POR_DEFECTO: OpcionesConexionBaseDatos = {
  reintentos: REINTENTOS_CONEXION,
  esperaMs: ESPERA_ENTRE_REINTENTOS_MS,
};

/**
 * Describe un error de conexión sin exponer su mensaje (puede incluir host o
 * usuario): solo el nombre de la clase y el código técnico, si lo tiene
 * (p. ej. `ECONNREFUSED` o el SQLSTATE `28P01`).
 */
export function describirError(error: unknown): string {
  const nombre = error instanceof Error ? error.name : 'Error';
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  return typeof codigo === 'string' && /^[A-Z0-9_]{1,30}$/.test(codigo)
    ? `${nombre} ${codigo}`
    : nombre;
}

/**
 * Abre la conexión con PostgreSQL **sin bloquear el arranque**.
 *
 * TypeORM se registra con `manualInitialization: true`, así que NestJS no
 * intenta conectar (ni tumba el proceso) al iniciar. Este servicio lo intenta
 * en segundo plano con reintentos limitados. Mientras no haya conexión, la API
 * responde y `/salud` informa `baseDatos: 'desconectada'`.
 *
 * Los mensajes de log no incluyen host, usuario ni clave.
 */
@Injectable()
export class ConexionBaseDatosServicio
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('BaseDatos');
  private temporizador: NodeJS.Timeout | undefined;
  private detenido = false;
  private intentoEnCurso: Promise<void> | undefined;

  constructor(
    @Inject(DataSource) private readonly fuenteDatos: DataSource,
    @Inject(OPCIONES_CONEXION_BASE_DATOS)
    private readonly opciones: OpcionesConexionBaseDatos,
  ) {}

  onApplicationBootstrap(): void {
    this.programarIntento(1, 0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.detenido = true;
    if (this.temporizador) {
      clearTimeout(this.temporizador);
    }
    await this.intentoEnCurso;
    if (this.fuenteDatos.isInitialized) {
      await this.fuenteDatos.destroy();
    }
  }

  private programarIntento(intento: number, esperaMs: number): void {
    this.temporizador = setTimeout(() => {
      this.intentoEnCurso = this.intentarConectar(intento);
    }, esperaMs);
    // El temporizador no mantiene vivo el proceso por sí solo.
    this.temporizador.unref();
  }

  private async intentarConectar(intento: number): Promise<void> {
    if (this.detenido || this.fuenteDatos.isInitialized) {
      return;
    }
    try {
      await this.fuenteDatos.initialize();
      this.logger.log('Conexión con PostgreSQL establecida.');
    } catch (error) {
      const motivo = describirError(error);
      if (intento >= this.opciones.reintentos) {
        this.logger.error(
          `No se pudo conectar con PostgreSQL tras ${intento} intentos (${motivo}). ` +
            'La API sigue respondiendo; reiníciela cuando la base de datos esté disponible.',
        );
        return;
      }
      this.logger.warn(
        `Intento ${intento}/${this.opciones.reintentos} de conexión con PostgreSQL fallido (${motivo}). ` +
          `Nuevo intento en ${this.opciones.esperaMs} ms.`,
      );
      if (!this.detenido) {
        this.programarIntento(intento + 1, this.opciones.esperaMs);
      }
    }
  }
}
