import { ErrorDominio } from '../../../../compartido/dominio/errores.js';
import { describirError } from '../../../../configuracion/conexion-base-datos.servicio.js';
import type { RestablecerClaveVendedorCasoUso } from '../../aplicacion/casos-uso/restablecer-clave-vendedor.caso-uso.js';
import { VendedorNoExisteError } from '../../dominio/cambio-clave.js';
import type { SalidaComando } from './crear-vendedor.comando.js';

/** Única variable que lee `npm run restablecer-clave-vendedor` (D-35). */
export const VARIABLE_CLAVE_NUEVA = 'VENDEDOR_CLAVE_NUEVA';

export type LectorClaveNueva = (
  nombre: typeof VARIABLE_CLAVE_NUEVA,
) => string | undefined;

/**
 * Lógica del comando `npm run restablecer-clave-vendedor` (RF-USU-05, D-35),
 * sin NestJS para poder probarla. Devuelve el código de salida (0 = correcto).
 *
 * Nunca escribe la clave, su hash ni datos personales: solo el id del
 * Vendedor y cuántas sesiones se cerraron.
 */
export async function ejecutarComandoRestablecerClaveVendedor(
  casoUso: Pick<RestablecerClaveVendedorCasoUso, 'ejecutar'>,
  leer: LectorClaveNueva,
  salida: SalidaComando,
): Promise<number> {
  const clave = leer(VARIABLE_CLAVE_NUEVA);
  if (clave === undefined || clave.trim().length === 0) {
    salida.error(
      `Falta la variable de entorno ${VARIABLE_CLAVE_NUEVA}. Defínala solo en esta terminal, por ejemplo: $env:${VARIABLE_CLAVE_NUEVA} = 'ClaveNueva2026' (ver README).`,
    );
    return 1;
  }
  try {
    const resultado = await casoUso.ejecutar(clave);
    salida.informar(
      `Clave del Vendedor restablecida (id: ${resultado.idUsuario}). Sesiones cerradas: ${resultado.sesionesRevocadas}. Borre ${VARIABLE_CLAVE_NUEVA} de la terminal.`,
    );
    return 0;
  } catch (error) {
    salida.error(describirFallo(error));
    return 1;
  }
}

function describirFallo(error: unknown): string {
  if (error instanceof VendedorNoExisteError) {
    return `No se cambió ninguna clave: ${error.message}`;
  }
  if (error instanceof ErrorDominio) {
    // Los mensajes de dominio no repiten el valor recibido.
    const variable =
      error.codigo === 'DATOS_INVALIDOS'
        ? ` Revise ${VARIABLE_CLAVE_NUEVA}.`
        : '';
    return `No se cambió la clave del Vendedor: ${error.message}${variable} (${error.codigo})`;
  }
  return `No se cambió la clave del Vendedor por un error inesperado (${describirError(error)}).`;
}
