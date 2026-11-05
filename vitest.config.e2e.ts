import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Variables falsas para las pruebas e2e. No apuntan a ninguna base real:
    // las pruebas de /salud sustituyen el puerto de la BD por uno falso.
    // Las e2e con PostgreSQL deben usar una base con sufijo `_pruebas`.
    env: {
      PUERTO: '3999',
      CORS_ORIGENES: 'http://localhost:4200',
      BD_HOST: '127.0.0.1',
      BD_PUERTO: '5432',
      BD_NOMBRE: 'catalogostock_pruebas',
      BD_USUARIO: 'usuario_pruebas',
      BD_CLAVE: 'clave_pruebas_falsa',
    },
  },
});
