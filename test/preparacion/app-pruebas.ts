import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  getStorageToken,
  type ThrottlerStorage,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacionHttp } from '../../src/configuracion/aplicacion-http.js';
import { ConexionBaseDatosServicio } from '../../src/configuracion/conexion-base-datos.servicio.js';
import { asegurarBasePruebas } from './entorno-pruebas.js';

export const ORIGEN_PRUEBAS = 'http://localhost:4200';

/**
 * Almacén del límite de intentos que se puede reiniciar entre pruebas: así
 * cada prueba empieza con el contador de su IP (127.0.0.1) en cero.
 */
export class AlmacenLimiteReiniciable implements ThrottlerStorage {
  private interno = new ThrottlerStorageService();

  increment(
    ...argumentos: Parameters<ThrottlerStorage['increment']>
  ): ReturnType<ThrottlerStorage['increment']> {
    return this.interno.increment(...argumentos);
  }

  reiniciar(): void {
    this.interno.onApplicationShutdown();
    this.interno = new ThrottlerStorageService();
  }
}

export interface AppPruebas {
  app: INestApplication;
  fuente: DataSource;
  /** Vacía todas las tablas (salvo `migraciones`) y reinicia el límite de intentos. */
  limpiar(): Promise<void>;
  cerrar(): Promise<void>;
}

export interface OpcionesAppPruebas {
  /**
   * Controladores que existen **solo** en las pruebas (nunca en `src/`), por
   * ejemplo una ruta del Vendedor para verificar CA-02 antes de que exista la
   * primera ruta administrativa real. Quedan bajo los mismos guards globales.
   */
  controladoresPrueba?: Type[];
}

/**
 * Levanta la API completa (AppModule, misma configuración HTTP que
 * producción) contra la base `catalogostock_pruebas` (D-23).
 */
export async function crearAppPruebas(
  opciones: OpcionesAppPruebas = {},
): Promise<AppPruebas> {
  asegurarBasePruebas(process.env.BD_NOMBRE);
  const almacen = new AlmacenLimiteReiniciable();

  const modulo = await Test.createTestingModule({
    imports: [AppModule],
    controllers: opciones.controladoresPrueba ?? [],
  })
    // La conexión se abre aquí, de forma síncrona, en lugar de en segundo plano.
    .overrideProvider(ConexionBaseDatosServicio)
    .useValue({})
    .overrideProvider(getStorageToken())
    .useValue(almacen)
    .compile();

  const app = modulo.createNestApplication<INestApplication>({
    logger: ['error', 'warn'],
  });
  configurarAplicacionHttp(app, [ORIGEN_PRUEBAS]);
  await app.init();

  const fuente = app.get(DataSource);
  if (!fuente.isInitialized) {
    await fuente.initialize();
  }
  const [{ base }] = await fuente.query<{ base: string }[]>(
    'SELECT current_database() AS base',
  );
  asegurarBasePruebas(base);

  return {
    app,
    fuente,
    async limpiar() {
      asegurarBasePruebas(base);
      const tablas = await fuente.query<{ tabla: string }[]>(
        `SELECT tablename AS tabla FROM pg_tables
         WHERE schemaname = 'public' AND tablename <> 'migraciones'`,
      );
      if (tablas.length > 0) {
        const lista = tablas.map(({ tabla }) => `"${tabla}"`).join(', ');
        await fuente.query(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
      }
      almacen.reiniciar();
    },
    async cerrar() {
      await app.close();
      if (fuente.isInitialized) {
        await fuente.destroy();
      }
    },
  };
}
