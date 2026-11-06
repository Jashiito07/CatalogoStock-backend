import { defineConfig } from 'vitest/config';
import { variablesEntornoPruebas } from './test/preparacion/entorno-pruebas.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // D-23: la conexión sale SOLO de .env.pruebas (base con sufijo _pruebas);
    // el resto son valores falsos. Nunca se usa .env (desarrollo).
    env: variablesEntornoPruebas(),
    // Borra el esquema de pruebas y aplica las migraciones antes de empezar.
    globalSetup: ['./test/preparacion/preparacion-global.ts'],
    // Todas las suites comparten la misma base: una a la vez.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
