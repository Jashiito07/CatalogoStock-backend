/**
 * Paginación común de la API (contrato, README: `pagina` ≥ 1, por defecto 1;
 * `tamanio` de 1 a 100, por defecto 20). TypeScript puro.
 */
export const PAGINA_POR_DEFECTO = 1;
export const TAMANIO_POR_DEFECTO = 20;
export const TAMANIO_MAXIMO = 100;

export interface Paginacion {
  readonly pagina: number;
  readonly tamanio: number;
}

export interface Pagina<T> {
  readonly elementos: readonly T[];
  readonly pagina: number;
  readonly tamanio: number;
  readonly total: number;
}

/** Filas que se saltan para llegar a la página pedida. */
export function desplazamiento(paginacion: Paginacion): number {
  return (paginacion.pagina - 1) * paginacion.tamanio;
}

/**
 * Completa los valores por defecto. Los rangos los valida el DTO de entrada
 * (400 `DATOS_INVALIDOS`); aquí se acotan por defensa, por si un caso de uso
 * se llama desde otro lugar.
 */
export function crearPaginacion(
  pagina: number = PAGINA_POR_DEFECTO,
  tamanio: number = TAMANIO_POR_DEFECTO,
): Paginacion {
  const paginaSegura =
    Number.isSafeInteger(pagina) && pagina >= 1 ? pagina : PAGINA_POR_DEFECTO;
  const tamanioSeguro =
    Number.isSafeInteger(tamanio) && tamanio >= 1
      ? Math.min(tamanio, TAMANIO_MAXIMO)
      : TAMANIO_POR_DEFECTO;
  return { pagina: paginaSegura, tamanio: tamanioSeguro };
}
