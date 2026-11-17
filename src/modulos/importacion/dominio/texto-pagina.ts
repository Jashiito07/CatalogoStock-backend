/**
 * Entrada del lector del catálogo (RF-PRO-01, D-49): el texto de cada página
 * con su posición. TypeScript puro: no depende de pdfjs ni de ninguna
 * librería de PDF; el adaptador de infraestructura traduce a esta forma.
 *
 * Las coordenadas están en puntos con el origen **arriba a la izquierda**:
 * `y0` es el borde superior y `y1` el inferior (crece hacia abajo).
 */
export interface BloqueTexto {
  /** Texto de una línea ya normalizado (espacios simples, sin caracteres invisibles). */
  texto: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Alto de la letra en puntos (sirve para distinguir títulos de texto corriente). */
  altura: number;
}

export interface PaginaTexto {
  /** Número de página del PDF, desde 1. */
  numero: number;
  ancho: number;
  alto: number;
  bloques: readonly BloqueTexto[];
}
