import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';
import type { VariablesEntorno } from './variables-entorno.js';

const archivoActual = fileURLToPath(import.meta.url);

/** Carpeta `src/` (o `dist/` una vez compilado). */
const carpetaRaiz = join(dirname(archivoActual), '..');

/**
 * Compilado se buscan `.js`; desde la fuente, `.ts`. Así el glob nunca toma
 * los `.d.ts` que genera la compilación.
 */
const extension = archivoActual.endsWith('.ts') ? 'ts' : 'js';

/** Los globs de TypeORM necesitan barras normales también en Windows. */
function aGlob(...partes: string[]): string {
  return join(carpetaRaiz, ...partes).replace(/\\/g, '/');
}

/** Migraciones compiladas (`dist/migraciones/*.js`) o fuente (`src/migraciones/*.ts`). */
export const GLOB_MIGRACIONES = aGlob('migraciones', `*.${extension}`);

/** Entidades ORM de todos los módulos, para la CLI de TypeORM. */
export const GLOB_ENTIDADES = aGlob(
  'modulos',
  '**',
  'infraestructura',
  'persistencia',
  `*.orm-entity.${extension}`,
);

/** Tiempo máximo para abrir una conexión con PostgreSQL. */
export const TIEMPO_CONEXION_MS = 5000;

/** Reintentos de conexión al arrancar (ver ConexionBaseDatosServicio). */
export const REINTENTOS_CONEXION = 5;
export const ESPERA_ENTRE_REINTENTOS_MS = 3000;

/**
 * Opciones comunes de PostgreSQL para la API y la CLI.
 * - `synchronize: false` siempre: el esquema cambia solo con migraciones.
 * - `migrationsRun: false`: las migraciones se ejecutan con su script.
 */
export function crearOpcionesPostgres(
  variables: Pick<
    VariablesEntorno,
    'BD_HOST' | 'BD_PUERTO' | 'BD_NOMBRE' | 'BD_USUARIO' | 'BD_CLAVE'
  >,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: variables.BD_HOST,
    port: variables.BD_PUERTO,
    database: variables.BD_NOMBRE,
    username: variables.BD_USUARIO,
    password: variables.BD_CLAVE,
    synchronize: false,
    migrationsRun: false,
    migrations: [GLOB_MIGRACIONES],
    migrationsTableName: 'migraciones',
    connectTimeoutMS: TIEMPO_CONEXION_MS,
    // Solo migraciones: registrar consultas o errores de consulta expondría
    // sus parámetros, que pueden contener datos personales (backend-seguridad).
    logging: ['migration'],
  };
}
