import { Dinero } from '../../../compartido/dominio/dinero.js';
import {
  type AdvertenciaBorrador,
  calcularAdvertencias,
} from './advertencias.js';

/** Perfil de lectura de un catálogo (contrato de importación, «Extracción»). */
export type PerfilCatalogo = 'YANBAL' | 'LEONISA';

/** Un producto propuesto por el lector a partir del texto de una página. */
export interface BorradorExtraido {
  /** Página del PDF, desde 1. */
  pagina: number;
  /** Orden de lectura dentro de la página, desde 0. */
  posicion: number;
  /** «CÓD.» (Yanbal) o primera «Ref.» (Leonisa): letras y dígitos, hasta 20. */
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  /** Precio vigente (`"35.00"`) o `null` si el lector no lo encontró. */
  precio: string | null;
  precioNormal: string | null;
  advertencias: AdvertenciaBorrador[];
}

/** Calcula las advertencias de un borrador extraído con textos de dinero. */
export function advertenciasDe(
  codigo: string | null,
  nombre: string,
  precio: string | null,
  precioNormal: string | null,
  persistentes: readonly AdvertenciaBorrador[],
): AdvertenciaBorrador[] {
  return calcularAdvertencias({
    codigo,
    nombre,
    precio: precio === null ? null : Dinero.desdeTexto(precio),
    precioNormal: precioNormal === null ? null : Dinero.desdeTexto(precioNormal),
    persistentes,
  });
}
