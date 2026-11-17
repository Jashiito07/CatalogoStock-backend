import { Injectable } from '@nestjs/common';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { LectorPdf } from '../../aplicacion/puertos/lector-pdf.puerto.js';
import {
  MAXIMO_PAGINAS_PDF,
  TIEMPO_MAXIMO_ANALISIS_MS,
} from '../../dominio/archivo-pdf.js';
import {
  ArchivoDemasiadoGrandeError,
  PdfIlegibleError,
} from '../../dominio/errores-importacion.js';
import type { BloqueTexto, PaginaTexto } from '../../dominio/texto-pagina.js';

export interface OpcionesLectorPdf {
  maximoPaginas?: number;
  tiempoMaximoMs?: number;
}

/** Fragmento de texto tal como lo entrega pdfjs, ya con coordenadas de arriba hacia abajo. */
interface Fragmento {
  texto: string;
  x0: number;
  x1: number;
  /** Línea base, medida desde el borde superior. */
  base: number;
  altura: number;
  /** pdfjs marcó el final de línea de su cuadro de texto: lo que siga en la fila es de otro cuadro. */
  finDeCuadro: boolean;
}

/**
 * Opciones de seguridad de pdfjs. `isEvalSupported: false` es la opción que
 * piden las versiones anteriores para no compilar funciones del PDF; la 6.x
 * ya no tiene evaluación dinámica (su compilación no contiene `eval` ni
 * `new Function`) y la ignora, pero se deja por defensa ante un cambio de
 * versión. Se declara aparte para que TypeScript no la rechace como propiedad
 * desconocida.
 */
const OPCIONES_SEGURAS = {
  isEvalSupported: false,
  enableXfa: false,
  useSystemFonts: false,
  disableFontFace: true,
  useWorkerFetch: false,
  stopAtErrors: false,
  verbosity: 0,
};

const CARACTERES_INVISIBLES = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

function normalizarTexto(texto: string): string {
  return texto
    .replace(CARACTERES_INVISIBLES, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface FragmentoTexto {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

function esFragmentoTexto(item: unknown): item is FragmentoTexto {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof item.str === 'string' &&
    'transform' in item &&
    Array.isArray(item.transform) &&
    'width' in item &&
    typeof item.width === 'number' &&
    'height' in item &&
    typeof item.height === 'number'
  );
}

/**
 * Convierte un fragmento de pdfjs en uno o más fragmentos con coordenadas
 * desde el borde superior. Los espacios de los extremos no cuentan como texto
 * (sus posiciones se estiman en proporción a los caracteres) y una racha de
 * tres o más espacios separa columnas dentro del mismo fragmento.
 */
function trocear(item: FragmentoTexto, alturaPagina: number): Fragmento[] {
  const total = item.str.length;
  if (total === 0 || item.str.trim() === '') {
    return [];
  }
  const [, , , , x, y] = item.transform;
  const altura = item.height > 0 ? item.height : Math.abs(item.transform[3]);
  const anchoPorCaracter = item.width / total;
  const fragmentos: Fragmento[] = [];
  for (const parte of item.str.matchAll(/\S(?:.*?\S)?(?=\s{3,}|\s*$)/gs)) {
    const inicio = parte.index;
    fragmentos.push({
      texto: parte[0],
      x0: x + anchoPorCaracter * inicio,
      x1: x + anchoPorCaracter * (inicio + parte[0].length),
      base: alturaPagina - y,
      altura,
      finDeCuadro: false,
    });
  }
  if (item.hasEOL === true && fragmentos.length > 0) {
    fragmentos[fragmentos.length - 1].finDeCuadro = true;
  }
  return fragmentos;
}

/**
 * Agrupa los fragmentos de una página en líneas: los que comparten línea base
 * (con una tolerancia proporcional a la letra) y están pegados horizontalmente.
 * Un hueco grande separa columnas distintas aunque estén a la misma altura.
 */
export function agruparEnLineas(
  fragmentos: readonly Fragmento[],
): BloqueTexto[] {
  const porAltura = fragmentos.toSorted((a, b) => a.base - b.base || a.x0 - b.x0);
  const filas: Fragmento[][] = [];
  for (const fragmento of porAltura) {
    const fila = filas.at(-1);
    // La tolerancia sigue a la letra más chica: un precio grande no arrastra el texto pequeño de al lado.
    const tolerancia = Math.max(
      1.5,
      0.4 * Math.min(fragmento.altura, fila?.[0].altura ?? fragmento.altura),
    );
    if (fila !== undefined && Math.abs(fila[0].base - fragmento.base) <= tolerancia) {
      fila.push(fragmento);
    } else {
      filas.push([fragmento]);
    }
  }

  const lineas: BloqueTexto[] = [];
  for (const fila of filas) {
    const ordenada = fila.toSorted((a, b) => a.x0 - b.x0);
    let actual: Fragmento[] = [];
    let finActual = 0;
    const cerrar = (): void => {
      const texto = normalizarTexto(actual.map((f) => f.texto).join(''));
      if (texto !== '') {
        const altura = Math.max(...actual.map((f) => f.altura));
        const base = Math.max(...actual.map((f) => f.base));
        lineas.push({
          texto,
          x0: actual[0].x0,
          x1: Math.max(...actual.map((f) => f.x1)),
          y0: base - altura,
          y1: base,
          altura,
        });
      }
      actual = [];
    };
    for (const fragmento of ordenada) {
      if (actual.length > 0) {
        const hueco = fragmento.x0 - finActual;
        const huecoMaximo = Math.max(5, 1.2 * fragmento.altura);
        if (actual.at(-1)?.finDeCuadro === true || hueco > huecoMaximo) {
          cerrar();
        } else if (
          hueco > 0.15 * fragmento.altura &&
          !/\s$/.test(actual.at(-1)?.texto ?? '') &&
          !/^\s/.test(fragmento.texto)
        ) {
          // Dos fragmentos separados por un espacio visual sin carácter de espacio.
          actual.push({ ...fragmento, texto: ` ${fragmento.texto}` });
          finActual = Math.max(finActual, fragmento.x1);
          continue;
        }
      }
      actual.push(fragmento);
      finActual = Math.max(finActual, fragmento.x1);
    }
    cerrar();
  }
  // De arriba hacia abajo y, a la misma altura, de izquierda a derecha.
  return lineas.toSorted((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
}

/**
 * Adaptador de `LectorPdf` con `pdfjs-dist` (D-49, dependencia aprobada).
 *
 * - Compilación «legacy» para Node: no necesita `canvas` ni el navegador.
 * - Seguridad: `isEvalSupported: false` (no compila funciones del PDF),
 *   `enableXfa: false`, sin fuentes del sistema ni remotas
 *   (`useSystemFonts`, `disableFontFace`, `useWorkerFetch` apagados) y sin
 *   cargar scripts ni rutas externas. Solo se lee texto: nunca se dibuja.
 * - Límites: páginas y tiempo (se comprueba entre páginas y se cierra el
 *   documento al excederlo).
 */
@Injectable()
export class LectorPdfPdfjs implements LectorPdf {
  private readonly maximoPaginas: number;
  private readonly tiempoMaximoMs: number;

  constructor(opciones: OpcionesLectorPdf = {}) {
    this.maximoPaginas = opciones.maximoPaginas ?? MAXIMO_PAGINAS_PDF;
    this.tiempoMaximoMs = opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_ANALISIS_MS;
  }

  async leer(contenido: Uint8Array): Promise<PaginaTexto[]> {
    const limite = Date.now() + this.tiempoMaximoMs;
    // pdfjs puede apropiarse del búfer: se le entrega una copia.
    const tarea = pdfjs.getDocument({
      ...OPCIONES_SEGURAS,
      data: Uint8Array.from(contenido),
    });
    try {
      const documento = await this.conTiempo(tarea.promise, limite);
      if (documento.numPages > this.maximoPaginas) {
        throw new ArchivoDemasiadoGrandeError(
          `El PDF no puede tener más de ${this.maximoPaginas} páginas.`,
        );
      }
      const paginas: PaginaTexto[] = [];
      for (let numero = 1; numero <= documento.numPages; numero++) {
        if (Date.now() > limite) {
          throw this.errorDeTiempo();
        }
        const pagina = await documento.getPage(numero);
        const vista = pagina.getViewport({ scale: 1 });
        const texto = await pagina.getTextContent();
        const fragmentos: Fragmento[] = [];
        for (const item of texto.items) {
          if (esFragmentoTexto(item)) {
            fragmentos.push(...trocear(item, vista.height));
          }
        }
        paginas.push({
          numero,
          ancho: vista.width,
          alto: vista.height,
          bloques: agruparEnLineas(fragmentos),
        });
        pagina.cleanup();
      }
      if (paginas.every((pagina) => pagina.bloques.length === 0)) {
        throw new PdfIlegibleError('El PDF no tiene texto que se pueda leer.');
      }
      return paginas;
    } catch (error) {
      throw this.traducir(error);
    } finally {
      // Libera el documento y detiene cualquier trabajo pendiente.
      await tarea.destroy().catch(() => undefined);
    }
  }

  private errorDeTiempo(): PdfIlegibleError {
    return new PdfIlegibleError('El análisis del PDF tardó demasiado.');
  }

  private conTiempo<T>(promesa: Promise<T>, limite: number): Promise<T> {
    const restante = Math.max(1, limite - Date.now());
    let temporizador: NodeJS.Timeout | undefined;
    const espera = new Promise<never>((_resolver, rechazar) => {
      temporizador = setTimeout(() => {
        rechazar(this.errorDeTiempo());
      }, restante);
    });
    return Promise.race([promesa, espera]).finally(() => {
      clearTimeout(temporizador);
    });
  }

  /** Todo fallo de lectura (cifrado, dañado, estructura inválida) es `PDF_ILEGIBLE`. */
  private traducir(error: unknown): Error {
    if (
      error instanceof PdfIlegibleError ||
      error instanceof ArchivoDemasiadoGrandeError
    ) {
      return error;
    }
    const nombre = error instanceof Error ? error.name : '';
    if (nombre === 'PasswordException') {
      return new PdfIlegibleError('El PDF está cifrado y no se puede leer.');
    }
    return new PdfIlegibleError('El PDF está dañado o no se puede leer.');
  }
}
