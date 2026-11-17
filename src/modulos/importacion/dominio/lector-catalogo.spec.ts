import type { BloqueTexto, PaginaTexto } from './texto-pagina.js';
import { leerCatalogo } from './lector-catalogo.js';
import { extraerBorradoresLeonisa } from './perfil-leonisa.js';
import { extraerBorradoresYanbal } from './perfil-yanbal.js';
import { normalizarPrecio } from './precio-catalogo.js';

/**
 * Fragmentos reproducidos a mano de las páginas de referencia (D-49, D-55):
 * el PDF real no se versiona. Las coordenadas son las del PDF original
 * (puntos, origen arriba a la izquierda); el ancho se estima por caracteres.
 */
function l(texto: string, x0: number, base: number, altura = 8): BloqueTexto {
  return {
    texto,
    x0,
    x1: x0 + texto.length * altura * 0.5,
    y0: base - altura,
    y1: base,
    altura,
  };
}

function pagina(numero: number, bloques: BloqueTexto[]): PaginaTexto {
  return { numero, ancho: 510, alto: 708, bloques };
}

describe('RF-PRO-01: perfil Yanbal (páginas de referencia)', () => {
  it('oferta top con gratis: precio vigente y normal, nombre entre el precio y el código, «Cont.» a la descripción', () => {
    const [borrador, ...resto] = extraerBorradoresYanbal([
      pagina(9, [
        l('50%', 357, 33, 24),
        l('dscto.', 357, 48, 14),
        l('US$ 41.00', 357, 73, 14),
        l('P. Normal US$ 82.00', 357, 83),
        l('Sofisticación en', 68, 86, 21),
        l('Liberatta', 357, 103),
        l('Parfum', 357, 113),
        l('Cont. 50 ml', 357, 123),
        l('CÓD. 236', 357, 136),
        l('+', 357, 151, 14),
        l('¡GRATIS!', 357, 166, 14),
        l('Hydra-Lip Líquido Mate', 357, 186),
        l('Caramel Nude', 357, 196),
        l('OFERTA TOP + GRATIS', 493, 255, 24),
      ]),
    ]);

    expect(resto).toHaveLength(0);
    expect(borrador).toMatchObject({
      pagina: 9,
      codigo: '236',
      nombre: 'Liberatta Parfum',
      descripcion: 'Cont. 50 ml',
      precio: '41.00',
      precioNormal: '82.00',
      advertencias: ['PRECIO_EN_OFERTA'],
    });
  });

  it('joyas numeradas: dos columnas, cada una con su precio, su precio normal y su nombre sin el número', () => {
    const borradores = extraerBorradoresYanbal([
      pagina(33, [
        l('1. Collar Verena', 51, 580),
        l('Largo aprox.', 51, 590),
        l('40 a 48 cm.', 51, 600),
        l('OFERTA', 51, 612, 6),
        l('US$ 104.00', 51, 627, 14),
        l('P. Normal US$ 130.00', 51, 637),
        l('CÓD. 43844', 51, 650),
        l('2. Aretes Verena Largos', 145, 580),
        l('Largo aprox. 4.4 cm.', 145, 590),
        l('Con pasador.', 145, 600),
        l('OFERTA', 145, 612, 6),
        l('US$ 38.00', 145, 627, 14),
        l('P. Normal US$ 48.00', 145, 637),
        l('CÓD. 43858', 145, 650),
      ]),
    ]);

    expect(borradores).toHaveLength(2);
    expect(borradores[0]).toMatchObject({
      codigo: '43844',
      nombre: 'Collar Verena',
      descripcion: 'Largo aprox. 40 a 48 cm.',
      precio: '104.00',
      precioNormal: '130.00',
    });
    expect(borradores[1]).toMatchObject({
      codigo: '43858',
      nombre: 'Aretes Verena Largos',
      precio: '38.00',
      precioNormal: '48.00',
    });
  });

  it('precio y código en bloques seguidos: «OFERTA US$ 0.50» sobre «CÓD.»; la etiqueta «EDICIÓN LIMITADA» no es el nombre', () => {
    const borradores = extraerBorradoresYanbal([
      pagina(3, [
        l('Bolsa de Regalo', 68, 563),
        l('OFERTA US$ 0.50', 68, 573, 6),
        l('CÓD. 60121', 68, 583),
        l('Pág. 5', 68, 593),
        l('EDICIÓN LIMITADA', 391, 242),
        l('Solo EDL', 391, 252),
        l('Parfum', 391, 262),
        l('OFERTA US$ 34.00', 391, 272, 6),
        l('CÓD. 2043', 391, 282),
        l('Pág. 123', 391, 292),
      ]),
    ]);

    expect(borradores).toHaveLength(2);
    const porCodigo = new Map(borradores.map((b) => [b.codigo, b]));
    expect(porCodigo.get('60121')).toMatchObject({
      nombre: 'Bolsa de Regalo',
      precio: '0.50',
      precioNormal: null,
      advertencias: [],
    });
    expect(porCodigo.get('2043')).toMatchObject({
      codigo: '2043',
      nombre: 'Solo EDL Parfum',
      precio: '34.00',
    });
  });

  it('ante la duda deja el campo vacío: sin precio cercano → SIN_PRECIO; sin nombre → «Sin nombre» + NOMBRE_DUDOSO; sin código y con precio → SIN_CODIGO', () => {
    const borradores = extraerBorradoresYanbal([
      pagina(25, [
        // El precio de cabecera está muy lejos y hay otro código en medio: no se toma.
        l('A TAN SOLO', 408, 25, 11),
        l('US$ 3.00', 408, 47, 14),
        l('1. Temptation', 81, 535),
        l('Mujer', 81, 545),
        l('CÓD. 6402', 81, 555),
        l('CÓD. 7777', 200, 600),
        l('Esmate de Uñas', 236, 654),
        l('OFERTA US$ 5.50', 236, 672, 6),
        l('Pág. 54', 236, 682),
      ]),
    ]);

    const porCodigo = new Map(borradores.map((b) => [b.codigo, b]));
    expect(porCodigo.get('6402')).toMatchObject({
      nombre: 'Temptation Mujer',
      precio: null,
      advertencias: ['SIN_PRECIO'],
    });
    expect(porCodigo.get('7777')).toMatchObject({
      nombre: 'Sin nombre (CÓD. 7777)',
      advertencias: ['SIN_PRECIO', 'NOMBRE_DUDOSO'],
    });
    expect(porCodigo.get(null)).toMatchObject({
      nombre: 'Esmate de Uñas',
      precio: '5.50',
      advertencias: ['SIN_CODIGO'],
    });
  });

  it('no inventa: una página sin «CÓD.» ni precio de oferta no produce borradores', () => {
    expect(
      extraerBorradoresYanbal([
        pagina(1, [l('Regala bienestar con', 52, 640, 21), l('30', 17, 700, 6)]),
      ]),
    ).toEqual([]);
  });
});

describe('RF-PRO-01: perfil Leonisa (páginas de referencia)', () => {
  it('«A. Cover Bra | $48.99 | descripción» con dos referencias: precio, primera referencia como código, VARIAS_REFERENCIAS y referencias en la descripción', () => {
    const [borrador, ...resto] = extraerBorradoresLeonisa([
      pagina(10, [
        l('COVER BRA', 38, 80, 10),
        l('Todo lo tiene, nada le sobra.', 24, 92),
        l('A. Cover Bra', 309, 555, 10),
        l('$48.99', 309, 571, 16),
        l('Con arco. Varillas laterales. PowerSlim en sisa y', 309, 581, 7),
        l('en la base del busto para mayor control. Multiu-', 309, 589, 7),
        l('sos: convencional y cruzado. 3 broches, 4 ajus-', 309, 596, 7),
        l('tes.', 309, 604, 7),
        l('Ref. 011970 / Copa B.', 309, 616),
        l('Tallas', 309, 625, 7),
        l('34', 363, 625, 7),
        l('36', 388, 625, 7),
        l('Blanco', 309, 633, 7),
        l('58149 58156', 357, 633, 7),
        l('Negro', 309, 641, 7),
        l('03525 03533', 357, 641, 7),
        l('Ref. 011970C / Copa C.', 309, 670),
        l('Tallas', 309, 679, 7),
        l('36', 363, 679, 7),
        l('Blanco', 309, 687, 7),
        l('00810 00828', 357, 687, 7),
        l('10', 28, 730, 10),
      ]),
    ]);

    expect(resto).toHaveLength(0);
    expect(borrador).toMatchObject({
      pagina: 10,
      codigo: '011970',
      nombre: 'Cover Bra',
      precio: '48.99',
      precioNormal: null,
      advertencias: ['VARIAS_REFERENCIAS'],
    });
    expect(borrador.descripcion).toBe(
      'Con arco. Varillas laterales. PowerSlim en sisa y en la base del busto para mayor control. ' +
        'Multiusos: convencional y cruzado. 3 broches, 4 ajustes. ' +
        'Ref. 011970 / Copa B (tallas 34, 36; Blanco, Negro). ' +
        'Ref. 011970C / Copa C (tallas 36; Blanco).',
    );
  });

  it('tres ítems en una fila: cada uno con su precio, su referencia alfanumérica y «Antes$» como precio normal', () => {
    const borradores = extraerBorradoresLeonisa([
      pagina(42, [
        l('A. Bóxer en algodón', 28, 577, 10),
        l('B. Hípster', 176, 577, 10),
        l('C. Cachetero x2', 325, 577, 10),
        l('$14.99', 28, 593, 16),
        l('$10.99', 176, 593, 16),
        l('$23.98', 325, 593, 16),
        l('Unidad a $11.99', 325, 602, 7),
        l('Tiro medio. Elástico suave en cintura.', 28, 603, 7),
        l('Tiro medio-bajo. Elaborado en microfi-', 176, 603, 7),
        l('Descaderados. Encaje en trasero.', 325, 612, 7),
        l('bra. Refuerzo inferior en algodón.', 176, 610, 7),
        l('Ref. 092082', 28, 630),
        l('Ref. 092094', 176, 623),
        l('Antes$12.99', 230, 623, 7),
        l('Ref. 12946X2', 325, 655),
        l('Tallas', 28, 639, 7),
      ]),
    ]);

    expect(borradores).toHaveLength(3);
    expect(borradores.map((b) => [b.codigo, b.nombre, b.precio])).toEqual([
      ['092082', 'Bóxer en algodón', '14.99'],
      ['092094', 'Hípster', '10.99'],
      ['12946X2', 'Cachetero x2', '23.98'],
    ]);
    expect(borradores[1].precioNormal).toBe('12.99');
    expect(borradores[1].advertencias).toEqual(['PRECIO_EN_OFERTA']);
    expect(borradores[2].descripcion).toContain('Unidad a $11.99');
  });

  it('sin referencia o sin precio: se importa con SIN_CODIGO / SIN_PRECIO; una leyenda «A. texto» sin precio ni referencia se ignora; los textos promocionales no son productos', () => {
    const borradores = extraerBorradoresLeonisa([
      pagina(20, [
        l('NUEVO', 100, 40, 12),
        l('HASTA COPA C', 57, 114),
        l('A. Varillas laterales', 325, 391),
        l('A. Panty sin costuras', 28, 500, 10),
        l('$9.99', 28, 516, 16),
        l('B. Bra sin precio', 176, 500, 10),
        l('Ref. 5555 / Copa B.', 176, 530),
        l('A. Antes de dormir', 28, 650, 10),
      ]),
    ]);

    expect(borradores).toHaveLength(2);
    expect(borradores[0]).toMatchObject({
      nombre: 'Panty sin costuras',
      codigo: null,
      precio: '9.99',
      advertencias: ['SIN_CODIGO'],
    });
    expect(borradores[1]).toMatchObject({
      nombre: 'Bra sin precio',
      codigo: '5555',
      precio: null,
      advertencias: ['SIN_PRECIO'],
    });
  });
});

describe('RF-PRO-01 / D-55: el perfil se elige por el contenido', () => {
  const paginaYanbal = pagina(9, [
    l('Liberatta', 357, 103),
    l('OFERTA US$ 41.00', 357, 113, 6),
    l('CÓD. 236', 357, 126),
  ]);
  const paginaLeonisa = pagina(10, [
    l('A. Cover Bra', 309, 555, 10),
    l('$48.99', 309, 571, 16),
    l('Ref. 011970 / Copa B.', 309, 616),
  ]);

  it('un documento de Yanbal no se lee con las reglas de Leonisa', () => {
    expect(extraerBorradoresLeonisa([paginaYanbal])).toEqual([]);
    const lectura = leerCatalogo([paginaYanbal]);
    expect(lectura.perfil).toBe('YANBAL');
    expect(lectura.borradores.map((b) => b.codigo)).toEqual(['236']);
  });

  it('un documento de Leonisa no se lee con las reglas de Yanbal', () => {
    expect(extraerBorradoresYanbal([paginaLeonisa])).toEqual([]);
    const lectura = leerCatalogo([paginaLeonisa]);
    expect(lectura.perfil).toBe('LEONISA');
    expect(lectura.borradores.map((b) => b.codigo)).toEqual(['011970']);
  });

  it('con contenido mezclado gana el perfil que reconoce más productos', () => {
    const lectura = leerCatalogo([paginaYanbal, paginaLeonisa, { ...paginaLeonisa, numero: 11 }]);
    expect(lectura.perfil).toBe('LEONISA');
    expect(lectura.borradores).toHaveLength(2);
  });

  it('si ningún perfil reconoce productos, no hay perfil ni borradores (el caso de uso responde 422 PDF_ILEGIBLE)', () => {
    expect(leerCatalogo([pagina(1, [l('Texto sin productos', 10, 20)])])).toEqual({
      perfil: null,
      borradores: [],
    });
  });

  it('CODIGO_REPETIDO se marca en todos los borradores con el mismo código, en cualquier perfil', () => {
    const lectura = leerCatalogo([
      paginaLeonisa,
      { ...paginaLeonisa, numero: 12 },
    ]);
    expect(lectura.borradores.map((b) => b.advertencias)).toEqual([
      ['CODIGO_REPETIDO'],
      ['CODIGO_REPETIDO'],
    ]);
  });
});

describe('RN-11: los precios son dinero exacto (texto con 2 decimales)', () => {
  it.each([
    ['35', '35.00'],
    ['35.5', '35.50'],
    ['35,5', '35.50'],
    ['1,234.50', '1234.50'],
    ['48.99', '48.99'],
  ])('«%s» se normaliza a «%s»', (entrada, esperado) => {
    expect(normalizarPrecio(entrada)).toBe(esperado);
  });

  it.each(['0', '0.00', '100000', 'abc', '12.505'])(
    '«%s» no es un precio válido',
    (entrada) => {
      expect(normalizarPrecio(entrada)).toBeNull();
    },
  );
});
