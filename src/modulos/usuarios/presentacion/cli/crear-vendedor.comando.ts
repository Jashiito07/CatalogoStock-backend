import { ErrorDominio } from '../../../../compartido/dominio/errores.js';
import { describirError } from '../../../../configuracion/conexion-base-datos.servicio.js';
import type {
  CrearVendedorCasoUso,
  DatosCrearVendedor,
} from '../../aplicacion/casos-uso/crear-vendedor.caso-uso.js';

/** Variables de entorno que lee `npm run crear-vendedor` (contrato de usuarios). */
export const VARIABLES_VENDEDOR = [
  'VENDEDOR_NOMBRE',
  'VENDEDOR_CORREO',
  'VENDEDOR_TELEFONO',
  'VENDEDOR_CLAVE',
] as const;

type VariableVendedor = (typeof VARIABLES_VENDEDOR)[number];

/** Lector de variables: `process.env` o el ConfigService de NestJS. */
export type LectorVariables = (nombre: VariableVendedor) => string | undefined;

/** Salida del comando. Nunca recibe la clave, su hash, el correo ni el teléfono. */
export interface SalidaComando {
  informar(mensaje: string): void;
  error(mensaje: string): void;
}

export class VariablesVendedorFaltantesError extends Error {
  constructor(readonly faltantes: readonly string[]) {
    super(
      `Faltan variables de entorno para crear el Vendedor: ${faltantes.join(', ')} (ver .env.example).`,
    );
    this.name = 'VariablesVendedorFaltantesError';
  }
}

/**
 * Lee los datos del Vendedor. Si falta alguna variable (o está vacía) falla
 * nombrando solo las variables, nunca sus valores.
 */
export function leerDatosVendedor(leer: LectorVariables): DatosCrearVendedor {
  const faltantes = VARIABLES_VENDEDOR.filter((nombre) => {
    const valor = leer(nombre);
    return valor === undefined || valor.trim().length === 0;
  });
  if (faltantes.length > 0) {
    throw new VariablesVendedorFaltantesError(faltantes);
  }
  return {
    nombre: leer('VENDEDOR_NOMBRE') ?? '',
    correo: leer('VENDEDOR_CORREO') ?? '',
    telefono: leer('VENDEDOR_TELEFONO') ?? '',
    clave: leer('VENDEDOR_CLAVE') ?? '',
  };
}

/**
 * Lógica del comando `npm run crear-vendedor` (D-07, PA-09), sin NestJS para
 * poder probarla. Devuelve el código de salida del proceso (0 = correcto).
 *
 * Solo informa el id del Vendedor: no escribe la clave, su hash ni datos
 * personales (backend-seguridad).
 */
export async function ejecutarComandoCrearVendedor(
  casoUso: Pick<CrearVendedorCasoUso, 'ejecutar'>,
  leer: LectorVariables,
  salida: SalidaComando,
): Promise<number> {
  try {
    const resultado = await casoUso.ejecutar(leerDatosVendedor(leer));
    if (resultado.creado) {
      salida.informar(`Vendedor creado (id: ${resultado.idUsuario}).`);
    } else {
      salida.informar(
        'Ya existe un Vendedor; no se hizo ningún cambio (PA-09: un solo Vendedor).',
      );
    }
    return 0;
  } catch (error) {
    salida.error(describirFallo(error));
    return 1;
  }
}

/** Campo del primer error de validación (`detalles.errores[0].campo`), si existe. */
function campoConError(error: ErrorDominio): string | undefined {
  const errores = error.detalles?.errores;
  if (!Array.isArray(errores) || errores.length === 0) {
    return undefined;
  }
  const primero: unknown = errores[0];
  if (
    typeof primero === 'object' &&
    primero !== null &&
    'campo' in primero &&
    typeof primero.campo === 'string' &&
    /^[a-z]+$/.test(primero.campo)
  ) {
    return primero.campo;
  }
  return undefined;
}

function describirFallo(error: unknown): string {
  if (error instanceof VariablesVendedorFaltantesError) {
    return error.message;
  }
  if (error instanceof ErrorDominio) {
    // Los mensajes de dominio de usuarios son genéricos: no repiten el valor recibido.
    const campo = campoConError(error);
    const variable = campo ? ` Revise VENDEDOR_${campo.toUpperCase()}.` : '';
    return `No se creó el Vendedor: ${error.message}${variable} (${error.codigo})`;
  }
  return `No se creó el Vendedor por un error inesperado (${describirError(error)}).`;
}
