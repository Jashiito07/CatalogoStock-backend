/**
 * Generador de PDF sintéticos mínimos para las pruebas (D-49, D-55): el PDF
 * real de referencia no se versiona y las pruebas no llevan binarios. El
 * nombre termina en `spec.ts` para que no se compile en `dist/`, pero no en
 * `.spec.ts`, para que Vitest no lo tome como archivo de pruebas.
 *
 * Cada línea es un texto Helvetica (WinAnsi) con su posición **desde el borde
 * superior** de la página; las páginas miden 510 x 708 puntos.
 */
export interface LineaSintetica {
  texto: string;
  x: number;
  /** Línea base, medida desde el borde superior. */
  y: number;
  tamanio?: number;
}

const ANCHO = 510;
const ALTO = 708;

/** Literal PDF en WinAnsi: escapa `( ) \` y escribe los caracteres no ASCII en octal. */
function literal(texto: string): string {
  let resultado = '';
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 63;
    if (caracter === '(' || caracter === ')' || caracter === '\\') {
      resultado += `\\${caracter}`;
    } else if (codigo >= 32 && codigo < 127) {
      resultado += caracter;
    } else if (codigo < 256) {
      resultado += `\\${codigo.toString(8).padStart(3, '0')}`;
    } else {
      resultado += '?';
    }
  }
  return resultado;
}

function contenidoDePagina(lineas: readonly LineaSintetica[]): string {
  return lineas
    .map(
      (linea) =>
        `BT /F1 ${linea.tamanio ?? 8} Tf ${linea.x} ${ALTO - linea.y} Td (${literal(linea.texto)}) Tj ET`,
    )
    .join('\n');
}

/** PDF válido de una o más páginas de texto, con la tabla `xref` calculada. */
export function crearPdfSintetico(
  paginas: readonly (readonly LineaSintetica[])[],
  extraTrailer = '',
): Buffer {
  const objetos: string[] = [];
  const idsPagina = paginas.map((_p, i) => 4 + i * 2);
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objetos[2] = `<< /Type /Pages /Kids [${idsPagina.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`;
  objetos[3] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  paginas.forEach((lineas, i) => {
    const idPagina = 4 + i * 2;
    const idContenido = idPagina + 1;
    objetos[idPagina] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${idContenido} 0 R >>`;
    const contenido = contenidoDePagina(lineas);
    objetos[idContenido] = `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`;
  });

  let cuerpo = '%PDF-1.4\n';
  const desplazamientos: number[] = [];
  for (let id = 1; id < objetos.length; id++) {
    desplazamientos[id] = Buffer.byteLength(cuerpo, 'latin1');
    cuerpo += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
  }
  const inicioXref = Buffer.byteLength(cuerpo, 'latin1');
  cuerpo += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objetos.length; id++) {
    cuerpo += `${String(desplazamientos[id]).padStart(10, '0')} 00000 n \n`;
  }
  cuerpo += `trailer\n<< /Size ${objetos.length} /Root 1 0 R ${extraTrailer} >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(cuerpo, 'latin1');
}

/** PDF marcado como cifrado (tráiler con `/Encrypt`): el servidor lo rechaza sin leerlo. */
export function crearPdfCifradoSintetico(): Buffer {
  return crearPdfSintetico(
    [[{ texto: 'Texto', x: 50, y: 50 }]],
    '/Encrypt << /Filter /Standard /V 1 /R 2 >>',
  );
}

/** Empieza con `%PDF-` pero no tiene estructura: pdfjs no puede leerlo. */
export function crearPdfDanadoSintetico(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Tipo roto\nesto no es un PDF valido\n%%EOF\n',
    'latin1',
  );
}

/** PDF válido de una página sin ningún texto. */
export function crearPdfSinTextoSintetico(): Buffer {
  return crearPdfSintetico([[]]);
}

/**
 * Catálogo sintético estilo Yanbal con 3 productos (contrato, «Pruebas
 * mínimas»): uno con oferta y precio normal, uno sin precio y uno sin código.
 *
 *   1. Crema Hidratante Mani · CÓD. 43873 · US$ 35.00 (normal US$ 44.00)
 *   2. Esmalte Color Rosa    · CÓD. 5054  · sin precio
 *   3. Jabón Líquido Avena   · sin código · US$ 5.50
 */
export function crearPdfYanbalSintetico(): Buffer {
  return crearPdfSintetico([
    [
      { texto: 'Crema Hidratante Mani', x: 50, y: 100 },
      { texto: 'OFERTA US$ 35.00', x: 50, y: 112 },
      { texto: 'P. Normal US$ 44.00', x: 50, y: 122 },
      { texto: 'CÓD. 43873', x: 50, y: 134 },
      { texto: 'Pág. 12', x: 50, y: 144 },
      { texto: 'Esmalte Color Rosa', x: 50, y: 200 },
      { texto: 'CÓD. 5054', x: 50, y: 212 },
      { texto: 'Jabón Líquido Avena', x: 50, y: 300 },
      { texto: 'OFERTA US$ 5.50', x: 50, y: 312 },
      { texto: 'Pág. 54', x: 50, y: 322 },
    ],
  ]);
}

/**
 * Catálogo sintético estilo Leonisa con 2 productos: «A. Magic Corset» con
 * dos referencias y «B. Panty clásico» con una y precio normal.
 */
export function crearPdfLeonisaSintetico(): Buffer {
  return crearPdfSintetico([
    [
      { texto: 'A. Magic Corset', x: 40, y: 100, tamanio: 10 },
      { texto: '$48.99', x: 40, y: 116, tamanio: 16 },
      { texto: 'Con arco. Varillas laterales.', x: 40, y: 126, tamanio: 7 },
      { texto: 'Multiusos: cruzado.', x: 40, y: 134, tamanio: 7 },
      { texto: 'Ref. 091183 / Copa B.', x: 40, y: 150 },
      { texto: 'Tallas', x: 40, y: 159, tamanio: 7 },
      { texto: '32', x: 95, y: 159, tamanio: 7 },
      { texto: '34', x: 120, y: 159, tamanio: 7 },
      { texto: 'Blanco', x: 40, y: 167, tamanio: 7 },
      { texto: '21006 21014', x: 90, y: 167, tamanio: 7 },
      { texto: 'Ref. 091183C / Copa C.', x: 40, y: 183 },
      { texto: 'Tallas', x: 40, y: 192, tamanio: 7 },
      { texto: '36', x: 95, y: 192, tamanio: 7 },
      { texto: 'Negro', x: 40, y: 200, tamanio: 7 },
      { texto: '03525 03533', x: 90, y: 200, tamanio: 7 },
      { texto: 'B. Panty clásico', x: 260, y: 100, tamanio: 10 },
      { texto: '$12.99', x: 260, y: 116, tamanio: 16 },
      { texto: 'Tiro medio. Elástico suave.', x: 260, y: 126, tamanio: 7 },
      { texto: 'Ref. 72323', x: 260, y: 150 },
      { texto: 'Antes$15.99', x: 340, y: 150, tamanio: 7 },
    ],
  ]);
}
