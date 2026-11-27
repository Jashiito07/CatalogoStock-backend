import {
  advertenciasDe,
  type BorradorExtraido,
} from './borrador-extraido.js';
import {
  LONGITUD_MAXIMA_NOMBRE_CONFIABLE,
  PREFIJO_NOMBRE_NO_LEIDO,
} from './advertencias.js';
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
  /^(Cont\.|Largo\b|Ancho\b|Alto\b|Medidas?\b|Di[áa]metro\b|Dimensiones\b|Con pasador|Tama[ñn]o\b|Peso\b)/i;
/** «Hidratante Cont. 30 g»: el contenido pegado al nombre en la misma línea pasa a la descripción. */
const CONTENIDO_EN_LINEA = /\s+(?=Cont\.\s*\d)/i;

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

/** La línea más cercana por debajo de `desde` (misma columna que `columna`). */
function siguienteAbajo(
  lineas: readonly Linea[],
  desde: Linea,
  columna: Linea,
): Linea | null {
  let mejor: Linea | null = null;
  for (const linea of lineas) {
    if (linea === desde || linea.y1 <= desde.y1 + 0.5) {
      continue;
    }
    if (!mismaColumna(linea, columna)) {
      continue;
    }
    if (mejor === null || linea.y1 < mejor.y1) {
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
  const [textoNombreBruto, ...contenidoEnLinea] = lineasNombre
    .map((l) => l.texto)
    .join(' ')
    .split(CONTENIDO_EN_LINEA);
  const { nombre, resto, recortado } = partirNombreLargo(
    limpiarNombre(textoNombreBruto),
  );
  const descripcion = [
    resto,
    ...contenidoEnLinea,
    ...lineasDescripcion.map((l) => l.texto),
  ]
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
  /** El precio no es del propio código: viene del bloque de precio de la ficha (`PRECIO_HEREDADO`). */
  heredado?: boolean;
  /** Título real de la ficha de la que se heredó el precio, para componer el nombre de la variante. */
  tituloFicha?: string | null;
}

/** Texto de un artículo promocional (bolsa, caja, regalo): su precio no es el de una ficha de variantes. */
const PATRON_PROMOCIONAL =
  /material promocional|bolsa de regalo|caja (?:especial|de regalo)|por la compra|compra especial|\bgratis\b|obsequio/i;
/** «2 X 1»: el precio es de una promoción, no el de cada variante. */
const PATRON_DOS_POR_UNO = /^\d\s*x\s*\d$/i;
/** Cuánto por encima y por debajo de su bloque de precio se mira si la ficha es promocional. */
const VENTANA_PROMOCIONAL_ARRIBA = 40;
const VENTANA_PROMOCIONAL_ABAJO = 90;
/** Hasta dónde, por debajo del precio, se busca el «+» que marca un set. */
const VENTANA_SET = 200;
/** Hasta dónde, por debajo del precio, se busca el «P. Normal» del bloque. */
const DISTANCIA_PRECIO_NORMAL = 40;
/** Una variante («Tono 1», «Burgundy») es corta: hasta 3 palabras y 40 caracteres. */
const PALABRAS_MAXIMAS_VARIANTE = 3;
const LONGITUD_MAXIMA_VARIANTE = 40;
/** Un título de ficha más largo describe varios productos a la vez: no se antepone a la variante. */
const LONGITUD_MAXIMA_TITULO = 50;
const SEPARADOR_FICHA = ' – ';

/** Una línea es el inicio de otro elemento numerado («2. Base Líquida»). */
function esElementoNumerado(linea: Linea): boolean {
  return /^\d{1,2}\s*[.)]\s+\S/.test(linea.texto.trim());
}

/**
 * Título real de la ficha: el texto pegado por debajo de su bloque de precio
 * («Jabones Perfumados en Barra»). Se detiene en el primer dato técnico
 * («Cont. 90 g»), en un código, en otro elemento numerado y en un salto
 * grande. Devuelve `null` si no hay un título limpio (no se inventa texto).
 */
function tituloDeFicha(
  bloque: Linea,
  ultimaLineaDelBloque: Linea,
  lineas: readonly Linea[],
): string | null {
  const pila: Linea[] = [];
  let actual = ultimaLineaDelBloque;
  let ruido = 0;
  for (let paso = 0; paso < 12; paso++) {
    const siguiente = siguienteAbajo(lineas, actual, bloque);
    if (siguiente === null) {
      break;
    }
    const factor = pila.length === 0 ? FACTOR_SALTO_INICIAL : FACTOR_SALTO;
    if (siguiente.y1 - actual.y1 > saltoMaximo(actual, siguiente, factor)) {
      break;
    }
    if (
      siguiente.conCodigo ||
      esLineaDePagina(siguiente) ||
      esEtiqueta(siguiente) ||
      PATRON_ESPECIFICACION.test(siguiente.texto.trim()) ||
      (pila.length > 0 && esElementoNumerado(siguiente))
    ) {
      break;
    }
    if (esRuido(siguiente)) {
      if (pila.length > 0 || ++ruido > 4) {
        break;
      }
      actual = siguiente;
      continue;
    }
    if (pila.length > 0) {
      const razon = siguiente.altura / Math.max(1, pila[0].altura);
      if (razon < 0.7 || razon > 1.4) {
        break;
      }
    }
    pila.push(siguiente);
    actual = siguiente;
  }
  if (pila.length === 0) {
    return null;
  }
  const { nombre, recortado } = aNombreYDescripcion({ lineas: pila });
  return recortado || !/\p{L}{3}/u.test(nombre) ? null : nombre;
}

/** Título pegado por **encima** del bloque de precio (el precio va debajo del nombre). */
function tituloSobreElPrecio(
  bloque: Linea,
  lineas: readonly Linea[],
): string | null {
  const { lineas: pila } = pilaDeNombre(bloque, bloque, lineas);
  if (pila.length === 0) {
    return null;
  }
  const { nombre, recortado } = aNombreYDescripcion({ lineas: pila });
  return recortado || !/\p{L}{3}/u.test(nombre) ? null : nombre;
}

/**
 * Herencia del precio de la ficha (D-xx, `PRECIO_HEREDADO`). En muchas páginas
 * el precio está en el encabezado de la ficha («OFERTA US$ 5.50 c/u») y las
 * variantes (tonos, aromas) llevan solo su «CÓD.» más abajo. Se hereda SOLO si:
 * - los códigos sin precio propio existen en la página;
 * - la página tiene exactamente **un** precio vigente sin dueño (ni de un
 *   código ni de un producto sin código): con varios candidatos no se sabe
 *   cuál es;
 * - ese bloque no es de un artículo promocional (bolsa, caja, «material promocional»);
 * - el código queda por debajo del bloque.
 * El resto sigue en `SIN_PRECIO` (RN-13, RN-14).
 */
function heredarPrecioDeFicha(
  candidatos: readonly Candidato[],
  lineas: readonly Linea[],
  reclamadas: ReadonlySet<Linea>,
): Candidato[] {
  const sinPrecio = candidatos.filter(
    (c) => c.codigo !== null && c.precio === null,
  );
  if (sinPrecio.length === 0) {
    return [...candidatos];
  }
  const anclasDeProducto = new Set(candidatos.map((c) => c.ancla));
  const hayVecina = (bloque: Linea, patron: RegExp): boolean =>
    lineas.some(
      (linea) =>
        !linea.conCodigo &&
        mismaColumna(linea, bloque) &&
        linea.y1 >= bloque.y1 - VENTANA_PROMOCIONAL_ARRIBA &&
        linea.y1 <= bloque.y1 + VENTANA_PROMOCIONAL_ABAJO &&
        patron.test(linea.texto.trim()),
    );
  // Un artículo promocional con código propio (bolsa, caja) no comparte su precio
  // con las variantes ni cuenta como «otro» precio de la página.
  const esArticuloPromocional = (bloque: Linea): boolean =>
    reclamadas.has(bloque) && hayVecina(bloque, PATRON_PROMOCIONAL);
  // Todo precio vigente de la página, de cualquier dueño: si hay más de un bloque
  // no se sabe a cuál pertenece cada variante. Los precios que van en la misma
  // línea que un «CÓD.» son de ese código y no compiten.
  const bloques = lineas.filter(
    (linea) =>
      !linea.conCodigo &&
      linea.precios.some((p) => !p.normal) &&
      !esArticuloPromocional(linea),
  );
  const totalPrecios = bloques.reduce(
    (suma, linea) => suma + linea.precios.filter((p) => !p.normal).length,
    0,
  );
  if (
    bloques.length !== 1 ||
    totalPrecios !== 1 ||
    reclamadas.has(bloques[0]) ||
    anclasDeProducto.has(bloques[0])
  ) {
    return [...candidatos];
  }
  const bloque = bloques[0];
  const vigente = bloque.precios.find((p) => !p.normal);
  // «2 X 1» o un bloque promocional: el precio no es el de cada variante.
  if (
    vigente === undefined ||
    hayVecina(bloque, PATRON_DOS_POR_UNO) ||
    hayVecina(bloque, PATRON_PROMOCIONAL)
  ) {
    return [...candidatos];
  }

  // «P. Normal»: en la misma línea o en la que sigue, pegada al precio.
  const normalEnLinea = bloque.precios.find((p) => p.normal);
  const lineaNormal = normalEnLinea
    ? bloque
    : lineas
        .filter(
          (linea) =>
            !reclamadas.has(linea) &&
            linea.precios.some((p) => p.normal) &&
            mismaColumna(linea, bloque) &&
            linea.y1 > bloque.y1 &&
            linea.y1 - bloque.y1 <= DISTANCIA_PRECIO_NORMAL,
        )
        .toSorted((a, b) => a.y1 - b.y1)[0];
  const normal =
    normalEnLinea?.valor ??
    lineaNormal?.precios.find((p) => p.normal)?.valor ??
    null;
  const ultimaLineaDelBloque =
    lineaNormal !== undefined && lineaNormal.y1 > bloque.y1 ? lineaNormal : bloque;
  // Un set («Ccori Parfum + Loción + Desodorante») no tiene un título de variante.
  const esSet = lineas.some(
    (linea) =>
      linea.texto.trim() === '+' &&
      mismaColumna(linea, bloque) &&
      linea.y1 > bloque.y1 &&
      linea.y1 <= bloque.y1 + VENTANA_SET,
  );
  const titulo = esSet
    ? null
    : (tituloDeFicha(bloque, ultimaLineaDelBloque, lineas) ??
      tituloSobreElPrecio(bloque, lineas));

  return candidatos.map((candidato) => {
    if (
      candidato.codigo === null ||
      candidato.precio !== null ||
      candidato.ancla.y1 <= bloque.y1
    ) {
      return candidato;
    }
    return {
      ...candidato,
      heredado: true,
      tituloFicha: titulo,
      precio: {
        vigente: vigente.valor,
        normal,
        tope: bloque,
        lineas: [bloque],
      },
    };
  });
}

/**
 * «Tono 1» → «Jabones Perfumados en Barra – Tono 1»: solo si el nombre es una
 * variante corta y el título es el real de la ficha. Si el resultado fuera
 * demasiado largo, queda el nombre de la variante sin cambios.
 */
function nombreConFicha(nombre: string, titulo: string | null | undefined): string {
  if (titulo === null || titulo === undefined || titulo === '') {
    return nombre;
  }
  const palabras = nombre.split(/\s+/).filter((p) => p !== '');
  if (
    [...titulo].length > LONGITUD_MAXIMA_TITULO ||
    palabras[0]?.toLowerCase() === titulo.split(/\s+/)[0].toLowerCase() ||
    palabras.length === 0 ||
    palabras.length > PALABRAS_MAXIMAS_VARIANTE ||
    [...nombre].length > LONGITUD_MAXIMA_VARIANTE ||
    titulo.toLowerCase().includes(nombre.toLowerCase()) ||
    nombre.toLowerCase().includes(titulo.toLowerCase()) ||
    nombre.startsWith(PREFIJO_NOMBRE_NO_LEIDO)
  ) {
    return nombre;
  }
  const compuesto = `${titulo}${SEPARADOR_FICHA}${nombre}`;
  return [...compuesto].length > LONGITUD_MAXIMA_NOMBRE_CONFIABLE
    ? nombre
    : compuesto;
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

  return heredarPrecioDeFicha(candidatos, lineas, reclamadas).toSorted(
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
      const nombre = nombreDeBorrador(
        candidato.heredado === true
          ? nombreConFicha(textoNombre, candidato.tituloFicha)
          : textoNombre,
        candidato.codigo,
      );
      const precio = candidato.precio?.vigente ?? null;
      const precioNormal = candidato.precio?.normal ?? null;
      const persistentes: ('NOMBRE_DUDOSO' | 'PRECIO_HEREDADO')[] = [];
      if (recortado) {
        persistentes.push('NOMBRE_DUDOSO');
      }
      if (candidato.heredado === true) {
        persistentes.push('PRECIO_HEREDADO');
      }
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
          persistentes,
        ),
      });
    });
  }
  return resultado;
}
