import type { PaginaTexto } from '../../dominio/texto-pagina.js';

/**
 * Puerto que extrae el texto de un PDF con su posición (RF-PRO-01, D-49). El
 * adaptador no ejecuta JavaScript del PDF, no usa recursos remotos y respeta
 * el máximo de páginas y de tiempo.
 *
 * Errores: `PdfIlegibleError` (422: cifrado, dañado, sin texto o fuera de
 * tiempo) y `ArchivoDemasiadoGrandeError` (413: demasiadas páginas).
 */
export interface LectorPdf {
  leer(contenido: Uint8Array): Promise<PaginaTexto[]>;
}

export const LECTOR_PDF = Symbol('LECTOR_PDF');
