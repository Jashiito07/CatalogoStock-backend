/**
 * Búsqueda de clientes del panel (RF-USU-05, sección «Clientes»; contrato de
 * recuperación de clave, `GET /api/v1/usuarios`). TypeScript puro.
 *
 * Se busca sin distinguir mayúsculas ni tildes en nombre, correo y teléfono.
 */
export const LONGITUD_MAXIMA_BUSQUEDA = 100;

export const MENSAJE_BUSQUEDA = `La búsqueda debe tener entre 1 y ${LONGITUD_MAXIMA_BUSQUEDA} caracteres.`;

/**
 * Letras con tilde (y la ñ, la ü y la ç) y su equivalente sin tilde, en
 * minúsculas. El adaptador de PostgreSQL aplica la misma tabla con
 * `translate(lower(columna), …)`, sin depender de la extensión `unaccent`
 * ni de la configuración regional de la base.
 */
export const LETRAS_CON_TILDE =
  'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ';
export const LETRAS_SIN_TILDE =
  'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc';

/** Texto en minúsculas y sin tildes (misma regla que la consulta SQL). */
export function normalizarParaBusqueda(texto: string): string {
  let resultado = '';
  for (const letra of texto.toLowerCase()) {
    const indice = LETRAS_CON_TILDE.indexOf(letra);
    resultado += indice >= 0 ? LETRAS_SIN_TILDE[indice] : letra;
  }
  return resultado;
}

export interface BusquedaClientes {
  /** Texto normalizado (minúsculas, sin tildes) para comparar con nombre y correo. */
  readonly texto: string;
  /**
   * Variante del teléfono en E.164 (D-14) cuando se escribe un celular
   * nacional que empieza con 0 (`0991` → `+593991`); `null` si no aplica.
   */
  readonly telefonoInternacional: string | null;
}

/**
 * Prepara la búsqueda: recorta espacios y normaliza. Un texto vacío (o solo
 * espacios) equivale a no filtrar y devuelve `null`.
 */
export function crearBusquedaClientes(
  entrada: string | undefined,
): BusquedaClientes | null {
  const recortada = entrada?.trim() ?? '';
  if (recortada.length === 0) {
    return null;
  }
  const texto = normalizarParaBusqueda(
    recortada.slice(0, LONGITUD_MAXIMA_BUSQUEDA),
  );
  const telefonoInternacional = /^0\d+$/.test(texto)
    ? `+593${texto.slice(1)}`
    : null;
  return { texto, telefonoInternacional };
}
