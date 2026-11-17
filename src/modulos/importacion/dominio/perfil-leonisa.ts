import {
  advertenciasDe,
  type BorradorExtraido,
} from './borrador-extraido.js';
import {
  nombreDeBorrador,
  partirNombreLargo,
} from './nombre-borrador.js';
import { normalizarPrecio } from './precio-catalogo.js';
import type { BloqueTexto, PaginaTexto } from './texto-pagina.js';

/**
 * Perfil Leonisa (RF-PRO-01, D-49, D-55): catálogos con productos como
 *
 *     A. Magic Corset            ← letra o número de ítem + nombre
 *     $48.99                     ← precio con «$» (y a veces «Antes$59.99»)
 *     Con arco. Varillas …       ← descripción
 *     Ref. 091183 / Copa B.      ← una o varias referencias
 *     Tallas 32 34 …  /  Blanco 21006 …
 *
 * TypeScript puro. Conservador (RN-13, RN-14): lo que no reconoce se omite o se
 * deja vacío con su advertencia. Las tallas y los colores **no** se modelan
 * (las existencias son de la Fase 3): con varias referencias se copian a la
 * descripción como texto.
 */

const PATRON_ITEM = /^([A-Z]|\d{1,2})\.\s+(\S.*)$/;
const IMPORTE = String.raw`(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)`;
const PATRON_PRECIO_LINEA = new RegExp(String.raw`^\$\s?${IMPORTE}`);
const PATRON_PRECIO_EN_TEXTO = new RegExp(String.raw`\s\$\s?${IMPORTE}`);
const PATRON_ANTES = new RegExp(String.raw`Antes\s*\$\s?${IMPORTE}`, 'i');
const PATRON_REFERENCIA = /^Ref\.\s*([A-Za-z0-9]{2,20})\b\s*(?:\/\s*)?(.*)$/;
const PATRON_TALLA = /^(XXS|XS|S|M|L|XL|XXL|XXXL|U|\d{2}[A-D]?)$/i;
const PATRON_COLOR = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .-]{1,24}$/;
const PATRON_FILA_DE_CODIGOS = /^[\d\s]{4,}$/;

/** Cuánto se separan, a lo sumo, los bordes izquierdos de una misma columna. */
const TOLERANCIA_COLUMNA = 15;
/** Distancia máxima, hacia abajo, a la que se busca el precio de un ítem. */
const DISTANCIA_MAXIMA_PRECIO = 45;
/** Distancia máxima, hacia abajo, que abarca un producto. */
const ALTO_MAXIMO_PRODUCTO = 450;
const FACTOR_SALTO = 1.8;
const LONGITUD_MAXIMA_DESCRIPCION = 2000;
const ANCHO_COLUMNA_POR_DEFECTO = 200;

type Linea = BloqueTexto;

interface Referencia {
  codigo: string;
  variante: string;
  tallas: string[];
  colores: string[];
}

function mismaColumna(linea: Linea, ancla: Linea): boolean {
  return Math.abs(linea.x0 - ancla.x0) <= TOLERANCIA_COLUMNA;
}

function saltoMaximo(a: Linea, b: Linea): number {
  return FACTOR_SALTO * Math.max(a.altura, b.altura) + 1;
}

/** Une líneas de un párrafo; una palabra cortada con guion al final de línea se recompone («Multiu-» + «sos»). */
function unirLineas(textos: readonly string[]): string {
  let resultado = '';
  for (const texto of textos) {
    const limpio = texto.trim();
    if (limpio === '') {
      continue;
    }
    if (resultado === '') {
      resultado = limpio;
    } else if (/[a-záéíóúñ]-$/i.test(resultado) && /^[a-záéíóúñ]/.test(limpio)) {
      resultado = `${resultado.slice(0, -1)}${limpio}`;
    } else {
      resultado = `${resultado} ${limpio}`;
    }
  }
  return resultado.replace(/\s+/g, ' ').trim();
}

function esItem(linea: Linea): RegExpExecArray | null {
  const coincidencia = PATRON_ITEM.exec(linea.texto.trim());
  if (coincidencia === null || !/\p{L}{2}/u.test(coincidencia[2])) {
    return null;
  }
  return coincidencia;
}

function esLineaDeReferencia(linea: Linea): boolean {
  return PATRON_REFERENCIA.test(linea.texto.trim());
}

/** Tallas de una referencia: lo que va a la derecha de «Tallas», en la misma fila. */
function leerTallas(
  zona: readonly Linea[],
  ancla: Linea,
): string[] {
  const titulo = zona.find(
    (l) => /^Tallas$/i.test(l.texto.trim()) && mismaColumna(l, ancla),
  );
  if (titulo === undefined) {
    return [];
  }
  return zona
    .filter(
      (l) =>
        Math.abs(l.y1 - titulo.y1) <= 2 &&
        l.x0 > titulo.x1 &&
        PATRON_TALLA.test(l.texto.trim()),
    )
    .toSorted((a, b) => a.x0 - b.x0)
    .map((l) => l.texto.trim());
}

/** Colores: nombres a la izquierda de una fila de códigos numéricos. */
function leerColores(zona: readonly Linea[], ancla: Linea): string[] {
  const colores: string[] = [];
  for (const linea of zona.toSorted((a, b) => a.y1 - b.y1)) {
    const texto = linea.texto.trim();
    if (
      !mismaColumna(linea, ancla) ||
      !PATRON_COLOR.test(texto) ||
      /^(Tallas|Opci[óo]n|Ref\.|Antes)/i.test(texto)
    ) {
      continue;
    }
    const conCodigos = zona.some(
      (otra) =>
        otra !== linea &&
        Math.abs(otra.y1 - linea.y1) <= 2 &&
        otra.x0 > linea.x1 &&
        PATRON_FILA_DE_CODIGOS.test(otra.texto.trim()),
    );
    if (conCodigos) {
      colores.push(texto);
    }
  }
  return colores;
}

function textoDeReferencia(referencia: Referencia): string {
  const variante = referencia.variante.replace(/[.\s]+$/, '').trim();
  const detalle: string[] = [];
  if (referencia.tallas.length > 0) {
    detalle.push(`tallas ${referencia.tallas.join(', ')}`);
  }
  if (referencia.colores.length > 0) {
    detalle.push(referencia.colores.join(', '));
  }
  const cabecera = `Ref. ${referencia.codigo}${variante === '' ? '' : ` / ${variante}`}`;
  return `${cabecera}${detalle.length === 0 ? '' : ` (${detalle.join('; ')})`}.`;
}

interface Producto {
  ancla: Linea;
  nombre: string;
  precio: string | null;
  precioNormal: string | null;
  descripcion: string;
  referencias: Referencia[];
}

function leerProducto(
  ancla: Linea,
  coincidencia: RegExpExecArray,
  lineas: readonly Linea[],
  anclas: readonly Linea[],
): Producto | null {
  const siguienteEnColumna = anclas
    .filter((otra) => otra.y1 > ancla.y1 && mismaColumna(otra, ancla))
    .reduce((minimo, otra) => Math.min(minimo, otra.y1), Infinity);
  const otrasColumnas = anclas
    .filter((otra) => otra.x0 > ancla.x0 + 30 && Math.abs(otra.y1 - ancla.y1) < 300)
    .reduce((minimo, otra) => Math.min(minimo, otra.x0), Infinity);
  const limiteDerecho =
    otrasColumnas === Infinity
      ? ancla.x0 + ANCHO_COLUMNA_POR_DEFECTO
      : otrasColumnas - 5;

  const region = lineas
    .filter(
      (l) =>
        l.y1 > ancla.y1 &&
        l.y1 < siguienteEnColumna &&
        l.y1 - ancla.y1 <= ALTO_MAXIMO_PRODUCTO &&
        l.x0 >= ancla.x0 - TOLERANCIA_COLUMNA &&
        l.x0 < limiteDerecho,
    )
    .toSorted((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const columna = region.filter((l) => mismaColumna(l, ancla));

  // Nombre: el texto del ítem (y, si lo hay, hasta dos líneas más antes del precio).
  let nombre = coincidencia[2].trim();
  let precio: string | null = null;
  const enLinea = PATRON_PRECIO_EN_TEXTO.exec(` ${nombre}`);
  if (enLinea !== null) {
    precio = normalizarPrecio(enLinea[1]);
    nombre = nombre.slice(0, Math.max(0, enLinea.index - 1)).trim();
  }

  let anterior: Linea = ancla;
  let indice = 0;
  if (precio === null) {
    let continuaciones = 0;
    for (; indice < columna.length; indice++) {
      const linea = columna[indice];
      const texto = linea.texto.trim();
      if (linea.y1 - anterior.y1 > DISTANCIA_MAXIMA_PRECIO) {
        break;
      }
      const sobrePrecio = PATRON_PRECIO_LINEA.exec(texto);
      if (sobrePrecio !== null) {
        precio = normalizarPrecio(sobrePrecio[1]);
        anterior = linea;
        indice++;
        break;
      }
      const razon = linea.altura / Math.max(1, ancla.altura);
      if (
        continuaciones < 2 &&
        !esLineaDeReferencia(linea) &&
        razon >= 0.7 &&
        razon <= 1.4 &&
        linea.y1 - anterior.y1 <= saltoMaximo(linea, anterior)
      ) {
        nombre = `${nombre} ${texto}`;
        continuaciones++;
        anterior = linea;
        continue;
      }
      break;
    }
  }

  // Descripción: líneas seguidas y de la misma letra, hasta la primera referencia.
  const lineasDescripcion: string[] = [];
  const primeraDescripcion = columna[indice];
  if (primeraDescripcion !== undefined) {
    const alturaBase = primeraDescripcion.altura;
    for (; indice < columna.length; indice++) {
      const linea = columna[indice];
      const razon = linea.altura / Math.max(1, alturaBase);
      if (
        esLineaDeReferencia(linea) ||
        /^Tallas$/i.test(linea.texto.trim()) ||
        razon < 0.7 ||
        razon > 1.4 ||
        linea.y1 - anterior.y1 > saltoMaximo(linea, anterior)
      ) {
        break;
      }
      lineasDescripcion.push(linea.texto);
      anterior = linea;
    }
  }

  // Referencias: cada «Ref.» de la columna, con las tallas y colores de su zona.
  const lineasReferencia = columna.filter(esLineaDeReferencia);
  const referencias: Referencia[] = lineasReferencia.map((linea, i) => {
    const partes = PATRON_REFERENCIA.exec(linea.texto.trim());
    const hasta = lineasReferencia[i + 1]?.y1 ?? Infinity;
    const zona = region.filter((l) => l.y1 > linea.y1 - 1 && l.y1 < hasta);
    return {
      codigo: partes?.[1] ?? '',
      variante: partes?.[2] ?? '',
      tallas: leerTallas(zona, ancla),
      colores: leerColores(zona, ancla),
    };
  });

  // Precio normal: «Antes$59.99», a la altura de la primera referencia o debajo del precio.
  let precioNormal: string | null = null;
  for (const linea of region) {
    const antes = PATRON_ANTES.exec(linea.texto);
    if (antes !== null) {
      precioNormal = normalizarPrecio(antes[1]);
      break;
    }
  }

  if (precio === null && referencias.length === 0) {
    // Una letra de ítem con texto, sin precio ni referencia, es una leyenda del catálogo.
    return null;
  }
  return {
    ancla,
    nombre,
    precio,
    precioNormal,
    descripcion: unirLineas(lineasDescripcion),
    referencias,
  };
}

function leerPagina(pagina: PaginaTexto): Producto[] {
  const lineas = pagina.bloques
    .filter((bloque) => bloque.texto.trim() !== '')
    .toSorted((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const anclas = lineas.filter((linea) => esItem(linea) !== null);
  const productos: Producto[] = [];
  for (const ancla of anclas) {
    const coincidencia = esItem(ancla);
    if (coincidencia === null) {
      continue;
    }
    const producto = leerProducto(ancla, coincidencia, lineas, anclas);
    if (producto !== null) {
      productos.push(producto);
    }
  }
  return productos;
}

/** Perfil Leonisa: extrae los borradores de todas las páginas. */
export function extraerBorradoresLeonisa(
  paginas: readonly PaginaTexto[],
): BorradorExtraido[] {
  const resultado: BorradorExtraido[] = [];
  for (const pagina of paginas) {
    leerPagina(pagina).forEach((producto, posicion) => {
      const { nombre: textoNombre, resto, recortado } = partirNombreLargo(
        producto.nombre.replace(/\s+/g, ' ').trim(),
      );
      const codigo = producto.referencias[0]?.codigo ?? null;
      const nombre = nombreDeBorrador(textoNombre, codigo);
      const varias = producto.referencias.length > 1;
      const partesDescripcion = [
        resto,
        producto.descripcion,
        ...(varias ? producto.referencias.map(textoDeReferencia) : []),
      ].filter((parte) => parte !== '');
      const descripcion = partesDescripcion.join(' ').trim();
      const persistentes: ('NOMBRE_DUDOSO' | 'VARIAS_REFERENCIAS')[] = [];
      if (recortado) {
        persistentes.push('NOMBRE_DUDOSO');
      }
      if (varias) {
        persistentes.push('VARIAS_REFERENCIAS');
      }
      resultado.push({
        pagina: pagina.numero,
        posicion,
        codigo,
        nombre,
        descripcion:
          descripcion === ''
            ? null
            : [...descripcion].slice(0, LONGITUD_MAXIMA_DESCRIPCION).join(''),
        precio: producto.precio,
        precioNormal: producto.precioNormal,
        advertencias: advertenciasDe(
          codigo,
          nombre,
          producto.precio,
          producto.precioNormal,
          persistentes,
        ),
      });
    });
  }
  return resultado;
}
