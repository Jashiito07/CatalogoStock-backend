import { normalizarColor } from './color.js';
import { ColorMarcaFijoError, NombreMarcaFijoError } from './errores-marca.js';
import type { CambiosMarca } from './marca.js';
import { buscarMarcaConocida } from './marcas-sugeridas.js';
import { NombreMarca } from './nombre-marca.js';

/** Datos de una marca nueva tras aplicar la regla de colores fijos (D-56). */
export interface DatosNuevaMarca {
  nombre: unknown;
  color: unknown;
  colorAcento: unknown;
}

/**
 * Alta (D-56): con un nombre conocido se guarda el nombre oficial y se
 * **imponen** los colores oficiales, ignorando los recibidos. Un nombre propio
 * conserva los datos tal como llegan (se validan en `Marca.crear`).
 */
export function resolverAltaDeMarca(datos: DatosNuevaMarca): DatosNuevaMarca {
  // Valida primero el nombre: 400 si es inválido, antes de reconocerlo.
  const nombre = NombreMarca.crear(datos.nombre);
  const conocida = buscarMarcaConocida(nombre.valor);
  if (conocida === null) {
    return datos;
  }
  return {
    nombre: conocida.nombre,
    color: conocida.color,
    colorAcento: conocida.colorAcento,
  };
}

function mismoAcento(recibido: unknown, oficial: string | null): boolean {
  if (recibido === null) {
    return oficial === null;
  }
  return normalizarColor(recibido, 'colorAcento') === oficial;
}

/**
 * Edición (D-56). Devuelve los cambios que de verdad se aplican:
 * - Marca conocida: renombrarla a otra cosa → `NOMBRE_MARCA_FIJO`; color o
 *   acento distintos de los oficiales → `COLOR_MARCA_FIJO`; iguales a los
 *   oficiales no es error. Una variante de su propio nombre se normaliza al
 *   nombre oficial.
 * - Marca propia renombrada a un nombre conocido: recibe el nombre y los
 *   colores oficiales.
 * - Marca propia sin nombre conocido: sin cambios en la regla.
 * `activa` y `orden` pasan intactos.
 */
export function resolverCambiosDeMarca(
  nombreActual: string,
  cambios: CambiosMarca,
): CambiosMarca {
  const actualConocida = buscarMarcaConocida(nombreActual);
  const nuevaConocida =
    cambios.nombre === undefined
      ? null
      : buscarMarcaConocida(NombreMarca.crear(cambios.nombre).valor);

  if (actualConocida !== null && cambios.nombre !== undefined) {
    if (nuevaConocida?.nombre !== actualConocida.nombre) {
      throw new NombreMarcaFijoError();
    }
  }

  if (nuevaConocida !== null && actualConocida === null) {
    // Una marca propia pasa a ser conocida: se imponen nombre y colores.
    return {
      ...cambios,
      nombre: nuevaConocida.nombre,
      color: nuevaConocida.color,
      colorAcento: nuevaConocida.colorAcento,
    };
  }

  if (actualConocida === null) {
    return cambios;
  }

  // Marca conocida (con o sin variante de su nombre).
  const resultado: CambiosMarca = { ...cambios };
  if (cambios.nombre !== undefined) {
    resultado.nombre = actualConocida.nombre;
  }
  if (cambios.color !== undefined) {
    if (normalizarColor(cambios.color) !== actualConocida.color) {
      throw new ColorMarcaFijoError();
    }
  }
  if (cambios.colorAcento !== undefined) {
    if (!mismoAcento(cambios.colorAcento, actualConocida.colorAcento)) {
      throw new ColorMarcaFijoError();
    }
  }
  return resultado;
}
