import {
  advertenciasDe,
  type BorradorExtraido,
} from './borrador-extraido.js';
import {
  LONGITUD_MAXIMA_DESCRIPCION_LECTOR as LONGITUD_MAXIMA_DESCRIPCION,
  nombreDeBorrador,
  partirNombreLargo,
} from './nombre-borrador.js';
import { normalizarPrecio } from './precio-catalogo.js';
import type { BloqueTexto, PaginaTexto } from './texto-pagina.js';

/**
 * Lector del catálogo (RF-PRO-01, D-49): convierte el texto con posición de
 * cada página en **borradores** de producto. TypeScript puro, sin pdfjs.
 *
 * Es aproximado y conservador (RN-13, RN-14): ante la duda deja el campo
 * vacío y añade una advertencia; nunca inventa un precio ni un código.
 *
 * Reglas (contrato de importación, «Extracción»):
 * - Un producto se reconoce por una línea con `CÓD.` seguido de dígitos. Los
 *   productos sin código se reconocen solo por un precio de oferta suelto con
 *   un nombre pegado encima (advertencia `SIN_CODIGO`).
 * - El precio es el `US$` más cercano en la misma columna, hacia arriba, sin
 *   cruzar otro código ni una referencia «Pág.». Si hay `P. Normal US$` se
 *   guarda como precio normal y el vigente es el otro.
 * - El nombre es el texto pegado al precio (por encima) o, si no hay, el que
 *   queda entre el precio y el código; no son nombre los precios, porcentajes,
 *   «OFERTA», «GRATIS», etiquetas ni números de página.
 */

/** Hasta dónde (en puntos) se busca el precio por encima del código. */
const DISTANCIA_MAXIMA_PRECIO = 120;
/** Un salto entre líneas mayor que este múltiplo de la letra corta una pila de texto. */
const FACTOR_SALTO = 1.8;
/** Idem, para el primer salto: del bloque de precio a la primera línea del nombre. */
const FACTOR_SALTO_INICIAL = 3;
/** Cuántas líneas de ruido (precio, oferta, etc.) se atraviesan antes del nombre. */
const RUIDO_MAXIMO_ANTES_NOMBRE = 8;

const PATRON_CODIGO = /C[ÓO]D\.?\s*[:.]?\s*(\d{1,12})(?!\d)/i;
const PATRON_CODIGOS_TODOS = /C[ÓO]D\.?\s*[:.]?\s*\d{1,12}(?!\d)/gi;
const PATRON_PRECIO =
  /(P\.?\s*Normal\s*)?US\$\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)/gi;
const PATRON_PAGINA = /^P[áa]gs?\.?\s*\d/i;
const PATRON_SOLO_NUMEROS = /^[\d\s.,/+-]*$/;
const PATRON_ETIQUETA_FICHA = /^[A-Z]?\d{1,2}[A-Z]?$/;
const PATRON_PORCENTAJE = /^\d{1,3}\s*%/;
const PATRON_ESPECIFICACION =
  /^(Cont\.|Largo\b|Ancho\b|Alto\b|Medida\b|Con pasador|Tama[ñn]o\b|Peso\b)/i;

/** Etiquetas sueltas del catálogo que acompañan al producto pero no son su nombre. */
const ETIQUETAS =
  /^(NUEVOS?|NOVEDAD(ES)?|EDICI[ÓO]N LIMITADA|COMPRA ESPECIAL|A TAN SOLO|DESDE|DESTACADOS?|OFERTA TOP|OFERTA|TOP)$/i;
const ETIQUETA_AL_INICIO =
  /^(NUEVOS?|NOVEDAD(ES)?|EDICI[ÓO]N LIMITADA|COMPRA ESPECIAL|A TAN SOLO)\s+/i;

interface PrecioEnLinea {
  valor: string;
  normal: boolean;
  /** Posición horizontal estimada del precio dentro de la línea. */
  x: number;
}

interface Linea extends BloqueTexto {
  /** Código reconocido (una sola mención de «CÓD.» en la línea). */
  codigo: string | null;
  /** La línea menciona algún «CÓD.» (aunque no se reconozca): corta toda búsqueda. */
  conCodigo: boolean;
  precios: PrecioEnLinea[];
}

interface Precio {
  vigente: string;
  normal: string | null;
  /** La línea de precio más alta usada (para buscar el nombre por encima). */
  tope: Linea;
  lineas: Linea[];
}

interface Pila {
  /** Líneas de arriba hacia abajo. */
  lineas: Linea[];
}

function extraerPrecios(bloque: BloqueTexto): PrecioEnLinea[] {
  const precios: PrecioEnLinea[] = [];
  const longitud = Math.max(1, bloque.texto.length);
  for (const coincidencia of bloque.texto.matchAll(PATRON_PRECIO)) {
    const valor = normalizarPrecio(coincidencia[2]);
    if (valor !== null) {
      precios.push({
        valor,
        normal: coincidencia[1] !== undefined,
        x: bloque.x0 + (coincidencia.index / longitud) * (bloque.x1 - bloque.x0),
      });
    }
  }
  return precios;
}

function analizar(bloque: BloqueTexto): Linea {
  const coincidencia = PATRON_CODIGO.exec(bloque.texto);
  // Una línea con varios «CÓD.» (listas de tonos en una fila) no permite saber
  // a qué nombre pertenece cada uno: no se reconoce ninguno (el Vendedor los agrega a mano).
  const varios = (bloque.texto.match(PATRON_CODIGOS_TODOS) ?? []).length > 1;
  return {
    ...bloque,
    codigo: coincidencia === null || varios ? null : coincidencia[1],
    conCodigo: coincidencia !== null,
    precios: extraerPrecios(bloque),
  };
}

function esLineaDePagina(linea: Linea): boolean {
  return PATRON_PAGINA.test(linea.texto);
}

/** Texto que nunca es el nombre de un producto: precios, ofertas, porcentajes, etiquetas, números. */
function esRuido(linea: Linea): boolean {
  const texto = linea.texto.trim();
  return (
    linea.precios.length > 0 ||
    /US\$/i.test(texto) ||
    /^OFERTA\b/i.test(texto) ||
    /\bdscto\b/i.test(texto) ||
    PATRON_PORCENTAJE.test(texto) ||
    /GRATIS/i.test(texto) ||
    /^c\/u\.?$/i.test(texto) ||
    /^[+*]+$/.test(texto) ||
    PATRON_SOLO_NUMEROS.test(texto) ||
    PATRON_ETIQUETA_FICHA.test(texto) ||
    [...texto].length < 2
  );
}

/** Etiquetas como «EDICIÓN LIMITADA»: cortan la pila y no forman parte del nombre. */
function esEtiqueta(linea: Linea): boolean {
  return ETIQUETAS.test(linea.texto.trim());
}

/** Dos líneas están en la misma columna si se superponen y empiezan cerca. */
function mismaColumna(a: Linea, b: Linea): boolean {
  const superposicion = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const menorAncho = Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
  return superposicion >= 0.4 * menorAncho && Math.abs(a.x0 - b.x0) <= 40;
}

function saltoMaximo(a: Linea, b: Linea, factor: number): number {
  return factor * Math.max(a.altura, b.altura) + 1;
}

/** La línea más cercana por encima de `desde` (misma columna que `columna`). */
function siguienteArriba(
  lineas: readonly Linea[],
  desde: Linea,
  columna: Linea,
): Linea | null {
  let mejor: Linea | null = null;
  for (const linea of lineas) {
    if (linea === desde || linea.y1 >= desde.y1 - 0.5) {
      continue;
    }
    if (!mismaColumna(linea, columna)) {
      continue;
    }
    if (mejor === null || linea.y1 > mejor.y1) {
      mejor = linea;
    }
  }
  return mejor;
}

/**
 * Precio de un código: el de su misma línea o el `US$` más cercano por encima
 * (misma columna). Se detiene en otro código, en una referencia «Pág.» o a
 * más de `DISTANCIA_MAXIMA_PRECIO` puntos.
 */
function buscarPrecio(
  codigo: Linea,
  lineas: readonly Linea[],
  reclamadas: ReadonlySet<Linea>,
): Precio | null {
  const estado: {
    vigente: string | null;
    normal: string | null;
    tope: Linea | null;
  } = { vigente: null, normal: null, tope: null };
  const usadas: Linea[] = [];

  // Si una línea trae varios precios del mismo tipo (columnas pegadas), se
  // toma el que está más cerca del borde izquierdo del código.
  const masCercano = (linea: Linea, normal: boolean): PrecioEnLinea | null => {
    const candidatos = linea.precios.filter((p) => p.normal === normal);
    return (
      candidatos.toSorted(
        (a, b) => Math.abs(a.x - codigo.x0) - Math.abs(b.x - codigo.x0),
      )[0] ?? null
    );
  };

  const tomar = (linea: Linea): void => {
    let uso = false;
    if (estado.normal === null) {
      const normal = masCercano(linea, true);
      if (normal !== null) {
        estado.normal = normal.valor;
        uso = true;
      }
    }
    if (estado.vigente === null) {
      const vigente = masCercano(linea, false);
      if (vigente !== null) {
        estado.vigente = vigente.valor;
        uso = true;
      }
    }
    if (uso) {
      usadas.push(linea);
      if (estado.tope === null || linea.y1 < estado.tope.y1) {
        estado.tope = linea;
      }
    }
  };

  tomar(codigo);
  let actual = codigo;
  let extra = 0;
  for (
    let paso = 0;
    paso < 40 && (estado.vigente === null || estado.normal === null);
    paso++
  ) {
    const siguiente = siguienteArriba(lineas, actual, codigo);
    if (siguiente === null) {
      break;
    }
    if (codigo.y1 - siguiente.y1 > DISTANCIA_MAXIMA_PRECIO) {
      break;
    }
    if (siguiente.conCodigo || esLineaDePagina(siguiente)) {
      break;
    }
    if (estado.vigente !== null) {
      // Ya hay precio vigente: solo se busca el normal, pegado al bloque de precio.
      extra++;
      if (
        extra > 3 ||
        (estado.tope !== null && estado.tope.y1 - siguiente.y1 > 30)
      ) {
        break;
      }
    }
    if (!reclamadas.has(siguiente)) {
      tomar(siguiente);
    }
    actual = siguiente;
  }
  if (estado.vigente === null || estado.tope === null) {
    return null;
  }
  return {
    vigente: estado.vigente,
    normal: estado.normal,
    tope: estado.tope,
    lineas: usadas,
  };
}

/**
 * Pila de líneas de nombre justo por encima de `desde`: salta primero el
 * ruido pegado (precio, «OFERTA», etc.) y luego junta las líneas de texto
 * seguidas y del mismo tamaño. Se corta en códigos, referencias «Pág.»,
 * etiquetas, ruido y saltos grandes.
 */
function pilaDeNombre(
  desde: Linea,
  columna: Linea,
  lineas: readonly Linea[],
): Pila {
  const pila: Linea[] = [];
  let actual = desde;
  let ruidoSaltado = 0;
  for (let paso = 0; paso < 40; paso++) {
    const siguiente = siguienteArriba(lineas, actual, columna);
    if (siguiente === null) {
      break;
    }
    // Entre el bloque de precio y la primera línea del nombre se admite un
    // espacio mayor que entre las líneas de un mismo texto.
    const factor = pila.length === 0 ? FACTOR_SALTO_INICIAL : FACTOR_SALTO;
    if (
      actual.y1 - siguiente.y1 >
      saltoMaximo(actual, siguiente, factor)
    ) {
      break;
    }
    if (siguiente.conCodigo || esLineaDePagina(siguiente)) {
      break;
    }
    if (esRuido(siguiente)) {
      if (pila.length > 0) {
        break;
      }
      ruidoSaltado++;
      if (ruidoSaltado > RUIDO_MAXIMO_ANTES_NOMBRE) {
        break;
      }
      actual = siguiente;
      continue;
    }
    if (esEtiqueta(siguiente)) {
      break;
    }
    if (pila.length > 0) {
      const razon = siguiente.altura / Math.max(1, pila[0].altura);
      if (razon < 0.7 || razon > 1.4) {
        break;
      }
    }
    pila.unshift(siguiente);
    actual = siguiente;
  }
  return { lineas: pila };
}

interface NombreYDescripcion {
  nombre: string;
  descripcion: string | null;
  /** El lector tuvo que cortar un texto largo para obtener el nombre. */
  recortado: boolean;
}

function limpiarNombre(texto: string): string {
  return texto
    .replace(ETIQUETA_AL_INICIO, '')
    .replace(/^\d{1,2}\s*[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Las líneas de la pila pasan a nombre hasta la primera especificación («Cont. 50 ml»); el resto, a la descripción. */
function aNombreYDescripcion(pila: Pila): NombreYDescripcion {
  const indiceEspecificacion = pila.lineas.findIndex((linea) =>
    PATRON_ESPECIFICACION.test(linea.texto.trim()),
  );
  const lineasNombre =
    indiceEspecificacion < 0
      ? pila.lineas
      : pila.lineas.slice(0, indiceEspecificacion);
  const lineasDescripcion =
    indiceEspecificacion < 0 ? [] : pila.lineas.slice(indiceEspecificacion);
  const { nombre, resto, recortado } = partirNombreLargo(
    limpiarNombre(lineasNombre.map((l) => l.texto).join(' ')),
  );
  const descripcion = [resto, ...lineasDescripcion.map((l) => l.texto)]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    nombre,
    recortado,
    descripcion:
      descripcion === ''
        ? null
        : [...descripcion].slice(0, LONGITUD_MAXIMA_DESCRIPCION).join(''),
  };
}

/**
 * Texto de la línea que va antes de «CÓD.», sin precios ni «OFERTA»; vacío si
 * no queda un texto con letras o es una variante («TALLA 6»), que no es un nombre.
 */
function textoAntesDelCodigo(linea: Linea): string {
  const indice = linea.texto.search(PATRON_CODIGO);
  if (indice <= 0) {
    return '';
  }
  const previo = linea.texto
    .slice(0, indice)
    .replace(PATRON_PRECIO, ' ')
    .replace(/\bP\.?\s*Normal\b/gi, ' ')
    .replace(/\bOFERTA( TOP)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(TALLA|TONO)\b/i.test(previo) || !/\p{L}{2}/u.test(previo)) {
    return '';
  }
  return previo;
}

interface Candidato {
  ancla: Linea;
  codigo: string | null;
  precio: Precio | null;
  pila: Pila;
}

function leerPagina(pagina: PaginaTexto): Candidato[] {
  const lineas = pagina.bloques
    .filter((bloque) => bloque.texto.trim() !== '')
    .map(analizar)
    .toSorted((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const reclamadas = new Set<Linea>();
  const candidatos: Candidato[] = [];

  for (const linea of lineas.filter((l) => l.codigo !== null)) {
    const precio = buscarPrecio(linea, lineas, reclamadas);
    if (precio !== null) {
      for (const usada of precio.lineas) {
        reclamadas.add(usada);
      }
    }
    // Primero el texto pegado por encima del bloque de precio; si no hay
    // (precio arriba y nombre entre el precio y el código), el más cercano al código.
    let pila: Pila = { lineas: [] };
    if (precio !== null) {
      pila = pilaDeNombre(precio.tope, linea, lineas);
    }
    if (pila.lineas.length === 0) {
      pila = pilaDeNombre(linea, linea, lineas);
    }
    if (pila.lineas.length === 0) {
      // «1. Gaïa CÓD. 354»: el nombre puede ir en la misma línea, antes del código.
      const previo = textoAntesDelCodigo(linea);
      if (previo !== '') {
        pila = { lineas: [{ ...linea, texto: previo }] };
      }
    }
    candidatos.push({ ancla: linea, codigo: linea.codigo, precio, pila });
  }

  // Productos sin código: un precio de oferta suelto con un nombre pegado encima.
  for (const linea of lineas) {
    if (reclamadas.has(linea) || linea.conCodigo) {
      continue;
    }
    const vigente = linea.precios.find((precio) => !precio.normal);
    if (vigente === undefined || !/^OFERTA\b/i.test(linea.texto)) {
      continue;
    }
    const pila = pilaDeNombre(linea, linea, lineas);
    if (pila.lineas.length === 0) {
      continue;
    }
    const normal = linea.precios.find((precio) => precio.normal);
    reclamadas.add(linea);
    candidatos.push({
      ancla: linea,
      codigo: null,
      precio: {
        vigente: vigente.valor,
        normal: normal?.valor ?? null,
        tope: linea,
        lineas: [linea],
      },
      pila,
    });
  }

  return candidatos.toSorted(
    (a, b) => a.ancla.y1 - b.ancla.y1 || a.ancla.x0 - b.ancla.x0,
  );
}

/**
 * Perfil Yanbal (`CÓD. 43873`, precios `US$ 35.00`): extrae los borradores de
 * todas las páginas. Los productos se reconocen por su «CÓD.»; el precio y el
 * nombre salen de las líneas vecinas en la misma columna.
 */
export function extraerBorradoresYanbal(
  paginas: readonly PaginaTexto[],
): BorradorExtraido[] {
  const resultado: BorradorExtraido[] = [];
  for (const pagina of paginas) {
    leerPagina(pagina).forEach((candidato, posicion) => {
      const {
        nombre: textoNombre,
        descripcion,
        recortado,
      } = aNombreYDescripcion(candidato.pila);
      const nombre = nombreDeBorrador(textoNombre, candidato.codigo);
      const precio = candidato.precio?.vigente ?? null;
      const precioNormal = candidato.precio?.normal ?? null;
      resultado.push({
        pagina: pagina.numero,
        posicion,
        codigo: candidato.codigo,
        nombre,
        descripcion,
        precio,
        precioNormal,
        advertencias: advertenciasDe(
          candidato.codigo,
          nombre,
          precio,
          precioNormal,
          recortado ? ['NOMBRE_DUDOSO'] : [],
        ),
      });
    });
  }
  return resultado;
}
