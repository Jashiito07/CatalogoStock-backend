import {
  CONTRASTE_MINIMO,
  COLORES_TEXTO_CANDIDATOS,
  luminanciaRelativa,
  normalizarColor,
  razonDeContraste,
  textoSobre,
} from './color.js';

describe('RNF-11 / RF-PRO-04: color de texto con contraste ≥ 4.5:1', () => {
  it('la razón de contraste de blanco y negro es 21:1', () => {
    expect(razonDeContraste('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(luminanciaRelativa('#FFFFFF')).toBeCloseTo(1, 5);
    expect(luminanciaRelativa('#000000')).toBe(0);
  });

  it.each([
    ['#FC5823', '#1E293B'], // Yanbal
    ['#FF2469', '#0F172A'], // Avon
    ['#2E1A47', '#FFFFFF'], // L'Bel
    ['#A90061', '#FFFFFF'], // Cyzone
    ['#E1251B', '#FFFFFF'], // Esika
    ['#222221', '#FFFFFF'], // Leonisa
    ['#F36E21', '#1E293B'], // acento de Leonisa
  ])('%s → texto %s', (fondo, esperado) => {
    expect(textoSobre(fondo)).toBe(esperado);
    expect(razonDeContraste(fondo, esperado)).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO,
    );
  });

  it('elige el primero de la lista que llega a 4.5:1', () => {
    for (const fondo of ['#FC5823', '#FF2469', '#2E1A47', '#F36E21']) {
      const elegido = textoSobre(fondo);
      const indice = COLORES_TEXTO_CANDIDATOS.indexOf(elegido);
      for (const anterior of COLORES_TEXTO_CANDIDATOS.slice(0, indice)) {
        expect(razonDeContraste(fondo, anterior)).toBeLessThan(
          CONTRASTE_MINIMO,
        );
      }
    }
  });

  it('cualquier color tiene un texto legible, incluidos los grises medios', () => {
    for (let canal = 0; canal <= 255; canal += 5) {
      const hex = canal.toString(16).padStart(2, '0').toUpperCase();
      const fondo = `#${hex}${hex}${hex}`;
      expect(razonDeContraste(fondo, textoSobre(fondo))).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO,
      );
    }
  });

  it('acepta minúsculas en la entrada', () => {
    expect(textoSobre('#fc5823')).toBe('#1E293B');
  });
});

describe('RNF-03: formato del color', () => {
  it('guarda el color en mayúsculas', () => {
    expect(normalizarColor('#fc5823')).toBe('#FC5823');
  });

  it.each([
    'FC5823',
    '#FC582',
    '#FC58233',
    '#GG5823',
    '',
    ' #FC5823',
    null,
    12,
  ])('rechaza %j', (valor) => {
    expect(() => normalizarColor(valor)).toThrowError(
      expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
    );
  });

  it('el error nombra el campo y nunca incluye el valor recibido', () => {
    let capturado: unknown;
    try {
      normalizarColor('rojo-secreto', 'colorAcento');
    } catch (error) {
      capturado = error;
    }
    expect(JSON.stringify(capturado)).not.toContain('rojo-secreto');
    expect(capturado).toMatchObject({
      detalles: { errores: [{ campo: 'colorAcento' }] },
    });
  });
});
