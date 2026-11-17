import {
  advertenciasDe,
  type BorradorExtraido,
  type PerfilCatalogo,
} from './borrador-extraido.js';
import { extraerBorradoresLeonisa } from './perfil-leonisa.js';
import { extraerBorradoresYanbal } from './perfil-yanbal.js';
import type { PaginaTexto } from './texto-pagina.js';

export type { BorradorExtraido, PerfilCatalogo } from './borrador-extraido.js';
export { normalizarPrecio } from './precio-catalogo.js';

/**
 * Lector del catálogo (RF-PRO-01, D-49, D-55): convierte el texto con posición
 * de cada página en **borradores** de producto. TypeScript puro, sin pdfjs.
 *
 * Soporta dos perfiles (Yanbal y Leonisa). El perfil se elige solo, por el
 * contenido del documento: gana el que reconoce más productos. Si ninguno
 * reconoce productos, no hay borradores y quien llama responde 422
 * `PDF_ILEGIBLE`.
 *
 * Es aproximado y conservador (RN-13, RN-14): ante la duda deja el campo
 * vacío y añade una advertencia; nunca inventa un precio ni un código.
 */

export interface LecturaCatalogo {
  /** El perfil que reconoció más productos, o `null` si ninguno reconoció alguno. */
  perfil: PerfilCatalogo | null;
  borradores: BorradorExtraido[];
}

/** `CODIGO_REPETIDO`: se marca en todos los borradores cuyo código aparece más de una vez en el PDF. */
function marcarCodigosRepetidos(
  borradores: readonly BorradorExtraido[],
): BorradorExtraido[] {
  const apariciones = new Map<string, number>();
  for (const borrador of borradores) {
    if (borrador.codigo !== null) {
      apariciones.set(
        borrador.codigo,
        (apariciones.get(borrador.codigo) ?? 0) + 1,
      );
    }
  }
  return borradores.map((borrador) => {
    if (
      borrador.codigo === null ||
      (apariciones.get(borrador.codigo) ?? 0) < 2
    ) {
      return borrador;
    }
    return {
      ...borrador,
      advertencias: advertenciasDe(
        borrador.codigo,
        borrador.nombre,
        borrador.precio,
        borrador.precioNormal,
        [...borrador.advertencias, 'CODIGO_REPETIDO'],
      ),
    };
  });
}

/** Lee el documento con los dos perfiles y se queda con el que reconoce más productos. */
export function leerCatalogo(
  paginas: readonly PaginaTexto[],
): LecturaCatalogo {
  const yanbal = extraerBorradoresYanbal(paginas);
  const leonisa = extraerBorradoresLeonisa(paginas);
  if (yanbal.length === 0 && leonisa.length === 0) {
    return { perfil: null, borradores: [] };
  }
  // Empate: Yanbal (el primer perfil del contrato).
  const esLeonisa = leonisa.length > yanbal.length;
  return {
    perfil: esLeonisa ? 'LEONISA' : 'YANBAL',
    borradores: marcarCodigosRepetidos(esLeonisa ? leonisa : yanbal),
  };
}

/** Los borradores del perfil elegido (atajo de `leerCatalogo`). */
export function extraerBorradores(
  paginas: readonly PaginaTexto[],
): BorradorExtraido[] {
  return leerCatalogo(paginas).borradores;
}
