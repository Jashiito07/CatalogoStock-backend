import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { crearOpcionesPostgres } from '../../src/configuracion/base-datos.config.js';
import {
  ARCHIVO_ENTORNO_PRUEBAS,
  asegurarBasePruebas,
  leerArchivoPruebas,
} from './entorno-pruebas.js';

/**
 * Preparación global de `npm run test:e2e` (D-23). Se ejecuta una vez:
 * 1. Lee la conexión de `.env.pruebas` y aborta si la base no termina en `_pruebas`.
 * 2. Comprueba con `current_database()` que la conexión es a esa base.
 * 3. Borra el esquema de pruebas y aplica todas las migraciones desde cero,
 *    para que el esquema sea siempre el de las migraciones actuales.
 */
export default async function prepararBasePruebas(): Promise<void> {
  const variables = leerArchivoPruebas();
  if (variables === null) {
    throw new Error(
      `Falta ${ARCHIVO_ENTORNO_PRUEBAS}: copie .env.pruebas.example y complete la conexión ` +
        'a la base catalogostock_pruebas (ver README, «Pruebas e2e»).',
    );
  }
  const nombre = asegurarBasePruebas(variables.BD_NOMBRE);

  const fuente = new DataSource({
    ...crearOpcionesPostgres({
      BD_HOST: variables.BD_HOST ?? '',
      BD_PUERTO: Number(variables.BD_PUERTO),
      BD_NOMBRE: nombre,
      BD_USUARIO: variables.BD_USUARIO ?? '',
      BD_CLAVE: variables.BD_CLAVE ?? '',
    }),
    // `crearOpcionesPostgres` ya trae todas las migraciones de src/migraciones.
    logging: false,
  });

  await fuente.initialize();
  try {
    const [{ base }] = await fuente.query<{ base: string }[]>(
      'SELECT current_database() AS base',
    );
    asegurarBasePruebas(base);
    await fuente.dropDatabase();
    await fuente.runMigrations({ transaction: 'each' });
  } finally {
    await fuente.destroy();
  }
}
