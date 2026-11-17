import type { MarcaPublica } from '../../marcas/index.js';
import type { Importacion, TotalesImportacion } from '../dominio/importacion.js';

/** Una importación con su marca y sus totales (contrato de importación, «Importación»). */
export interface VistaImportacion {
  importacion: Importacion;
  marca: MarcaPublica;
  totales: TotalesImportacion;
}
