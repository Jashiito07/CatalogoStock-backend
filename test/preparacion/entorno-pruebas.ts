import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Variables de entorno de las pruebas e2e (D-23).
 *
 * La conexión con PostgreSQL sale **solo** de `.env.pruebas` (local, fuera de
 * Git; ver `.env.pruebas.example`). Nunca se toma de `.env` ni de las
 * variables `BD_*` de la terminal, para que el e2e no pueda apuntar a la base
 * de desarrollo por error. El resto son valores falsos fijos.
 */
export const ARCHIVO_ENTORNO_PRUEBAS = '.env.pruebas';
export const SUFIJO_BASE_PRUEBAS = '_pruebas';

const VARIABLES_BD = [
  'BD_HOST',
  'BD_PUERTO',
  'BD_NOMBRE',
  'BD_USUARIO',
  'BD_CLAVE',
] as const;

/** Valores falsos: no son secretos reales y solo sirven en las pruebas. */
const VALORES_FIJOS: Readonly<Record<string, string>> = {
  PUERTO: '3999',
  CORS_ORIGENES: 'http://localhost:4200',
  // Costo mínimo permitido: las pruebas hacen muchos hash.
  BCRYPT_COSTO: '10',
  JWT_SECRETO: 'secreto_falso_solo_para_pruebas_e2e_0123456789',
  RECUPERACION_SECRETO: 'secreto_falso_de_recuperacion_solo_e2e_0123456789',
  JWT_VIDA_ACCESO_SEGUNDOS: '900',
  RENOVACION_VIDA_DIAS: '7',
  PROXY_SALTOS_CONFIABLES: '0',
};

/**
 * Sin `.env.pruebas`, BD_NOMBRE queda con un nombre que no existe: las
 * pruebas que no usan la base (salud) siguen funcionando y la preparación
 * global explica qué falta.
 */
const BASE_SIN_CONFIGURAR = 'base_sin_configurar_pruebas';

export function leerArchivoPruebas(
  raiz: string = process.cwd(),
): Record<string, string> | null {
  const ruta = resolve(raiz, ARCHIVO_ENTORNO_PRUEBAS);
  if (!existsSync(ruta)) {
    return null;
  }
  const leidas = parseEnv(readFileSync(ruta, 'utf8'));
  const resultado: Record<string, string> = {};
  for (const nombre of VARIABLES_BD) {
    const valor = leidas[nombre];
    if (typeof valor === 'string') {
      resultado[nombre] = valor;
    }
  }
  return resultado;
}

/** Variables que Vitest inyecta en `process.env` de las pruebas e2e. */
export function variablesEntornoPruebas(
  raiz: string = process.cwd(),
): Record<string, string> {
  const delArchivo = leerArchivoPruebas(raiz) ?? {};
  return {
    ...VALORES_FIJOS,
    BD_HOST: '127.0.0.1',
    BD_PUERTO: '5432',
    BD_USUARIO: 'usuario_sin_configurar',
    BD_CLAVE: 'clave_sin_configurar',
    BD_NOMBRE: BASE_SIN_CONFIGURAR,
    ...delArchivo,
  };
}

/**
 * Aborta si el nombre de la base no termina en `_pruebas` (D-23). Se llama
 * antes de migrar, antes de limpiar y con el nombre real que devuelve
 * PostgreSQL (`current_database()`).
 */
export function asegurarBasePruebas(nombre: string | undefined): string {
  if (!nombre || !nombre.endsWith(SUFIJO_BASE_PRUEBAS)) {
    throw new Error(
      `PELIGRO: las pruebas e2e solo pueden usar una base cuyo nombre termine en "${SUFIJO_BASE_PRUEBAS}" ` +
        `(D-23); se recibió "${nombre ?? '(vacío)'}". Revise ${ARCHIVO_ENTORNO_PRUEBAS}.`,
    );
  }
  return nombre;
}
