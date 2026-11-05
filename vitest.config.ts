import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resuelve los alias de rutas declarados en tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/migraciones/**'],
      // RNF-15 / backend-pruebas: al menos 70 % de cobertura en dominio.
      thresholds: {
        'src/**/dominio/**': {
          statements: 70,
          branches: 70,
          functions: 70,
          lines: 70,
        },
      },
    },
  },
});
