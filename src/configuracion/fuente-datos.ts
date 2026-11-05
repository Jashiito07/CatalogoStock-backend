import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { crearOpcionesPostgres, GLOB_ENTIDADES } from './base-datos.config.js';
import { validarVariablesEntorno } from './variables-entorno.js';

/**
 * Fuente de datos para la CLI de TypeORM (migracion:generar, :ejecutar, :revertir).
 * Los scripts compilan primero y usan `dist/configuracion/fuente-datos.js`.
 *
 * Lee `.env` con `process.loadEnvFile` de Node (sin dependencias extra); si no
 * existe, usa las variables ya definidas en el entorno.
 */
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const variables = validarVariablesEntorno(process.env);

const fuenteDatos = new DataSource({
  ...crearOpcionesPostgres(variables),
  entities: [GLOB_ENTIDADES],
});

export default fuenteDatos;
