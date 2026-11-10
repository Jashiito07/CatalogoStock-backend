import {
  calcularVencimientoCodigo,
  CodigoNoVigenteError,
  CodigoRecuperacion,
  CodigoRecuperacionInvalidoError,
  esFormatoCodigoRecuperacion,
  formatearCodigoRecuperacion,
  INTENTOS_MAXIMOS_CODIGO,
  MENSAJE_CODIGO_INVALIDO,
  type PropiedadesCodigoRecuperacion,
  VIGENCIA_CODIGO_MINUTOS,
} from './codigo-recuperacion.js';

const AHORA = new Date('2026-11-09T15:15:00.000Z');
const MINUTO = 60 * 1000;

function nuevo(): CodigoRecuperacion {
  return CodigoRecuperacion.generar({
    id: 'id-codigo',
    idUsuario: 'id-cliente',
    hashCodigo: 'hash-del-codigo',
    generadoPor: 'id-vendedor',
    ahora: AHORA,
  });
}

function minutosDespues(minutos: number): Date {
  return new Date(AHORA.getTime() + minutos * MINUTO);
}

describe('RF-USU-05 / D-39: código de recuperación (dominio)', () => {
  describe('formato', () => {
    it.each(['000000', '482913', '999999'])('acepta «%s»', (codigo) => {
      expect(esFormatoCodigoRecuperacion(codigo)).toBe(true);
    });

    it.each([
      '12345',
      '1234567',
      '12a456',
      ' 123456',
      '１２３４５６',
      123456,
      null,
    ])('rechaza %j', (codigo) => {
      expect(esFormatoCodigoRecuperacion(codigo)).toBe(false);
    });

    it('rellena con ceros a la izquierda hasta 6 dígitos', () => {
      expect(formatearCodigoRecuperacion(7)).toBe('000007');
      expect(formatearCodigoRecuperacion(0)).toBe('000000');
      expect(formatearCodigoRecuperacion(999_999)).toBe('999999');
    });

    it.each([-1, 1_000_000, 1.5, Number.NaN])(
      'no formatea un número fuera de rango (%d)',
      (numero) => {
        expect(() => formatearCodigoRecuperacion(numero)).toThrow(
          'El número del código debe estar entre 0 y 999999.',
        );
      },
    );
  });

  it('vence 15 minutos después de generarse', () => {
    expect(VIGENCIA_CODIGO_MINUTOS).toBe(15);
    expect(calcularVencimientoCodigo(AHORA)).toEqual(minutosDespues(15));
    const codigo = nuevo();
    expect(codigo.venceEn).toEqual(minutosDespues(15));
    expect(codigo.intentosFallidos).toBe(0);
    expect(codigo.estadoEn(minutosDespues(14.99))).toBe('VIGENTE');
    expect(codigo.estadoEn(minutosDespues(15))).toBe('VENCIDO');
    expect(codigo.vigenteHasta(AHORA)).toEqual(minutosDespues(15));
    expect(codigo.vigenteHasta(minutosDespues(16))).toBeNull();
  });

  it('se usa una sola vez', () => {
    const codigo = nuevo();
    codigo.marcarUsado(minutosDespues(1));

    expect(codigo.usadoEn).toEqual(minutosDespues(1));
    expect(codigo.estadoEn(minutosDespues(2))).toBe('USADO');
    expect(codigo.motivoSiNoVigente(minutosDespues(2))).toBe('SIN_CODIGO');
    expect(() => codigo.marcarUsado(minutosDespues(2))).toThrow(
      CodigoNoVigenteError,
    );
  });

  it('el quinto intento fallido lo invalida (AGOTADO), aunque siga dentro de los 15 minutos', () => {
    const codigo = nuevo();
    for (let intento = 1; intento < INTENTOS_MAXIMOS_CODIGO; intento++) {
      codigo.registrarIntentoFallido(minutosDespues(1));
      expect(codigo.estadoEn(minutosDespues(1))).toBe('VIGENTE');
    }
    codigo.registrarIntentoFallido(minutosDespues(2));

    expect(codigo.intentosFallidos).toBe(5);
    expect(codigo.invalidadoEn).toEqual(minutosDespues(2));
    expect(codigo.estadoEn(minutosDespues(3))).toBe('AGOTADO');
    expect(codigo.motivoSiNoVigente(minutosDespues(3))).toBe('AGOTADO');
    expect(() => codigo.marcarUsado(minutosDespues(3))).toThrow(
      CodigoNoVigenteError,
    );
    expect(() => codigo.registrarIntentoFallido(minutosDespues(3))).toThrow(
      CodigoNoVigenteError,
    );
  });

  it('un código vencido no suma intentos ni se puede usar', () => {
    const codigo = nuevo();
    expect(codigo.motivoSiNoVigente(minutosDespues(20))).toBe('VENCIDO');
    expect(() => codigo.registrarIntentoFallido(minutosDespues(20))).toThrow(
      CodigoNoVigenteError,
    );
    expect(codigo.intentosFallidos).toBe(0);
  });

  it('un código reemplazado por otro (invalidado) cuenta como «sin código»', () => {
    const propiedades: PropiedadesCodigoRecuperacion = {
      ...nuevo().toJSON(),
      hashCodigo: 'hash',
      invalidadoEn: minutosDespues(1),
    };
    const codigo = CodigoRecuperacion.reconstituir(propiedades);
    expect(codigo.estadoEn(minutosDespues(2))).toBe('INVALIDADO');
    expect(codigo.motivoSiNoVigente(minutosDespues(2))).toBe('SIN_CODIGO');
    expect(codigo.motivoSiNoVigente(AHORA)).toBe('SIN_CODIGO');
  });

  it('un código vigente no tiene motivo de rechazo', () => {
    expect(nuevo().motivoSiNoVigente(minutosDespues(1))).toBeNull();
  });

  it('el uso tiene prioridad sobre el vencimiento', () => {
    const codigo = nuevo();
    codigo.marcarUsado(minutosDespues(1));
    expect(codigo.estadoEn(minutosDespues(60))).toBe('USADO');
  });

  it('rechaza datos guardados fuera de las reglas', () => {
    const base: PropiedadesCodigoRecuperacion = {
      ...nuevo().toJSON(),
      hashCodigo: 'hash',
    };
    expect(() =>
      CodigoRecuperacion.reconstituir({ ...base, hashCodigo: '' }),
    ).toThrow('debe tener su hash');
    expect(() =>
      CodigoRecuperacion.reconstituir({ ...base, venceEn: base.creadoEn }),
    ).toThrow('debe vencer después de crearse');
    expect(() =>
      CodigoRecuperacion.reconstituir({ ...base, intentosFallidos: 6 }),
    ).toThrow('Los intentos fallidos');
    expect(() =>
      CodigoRecuperacion.reconstituir({ ...base, intentosFallidos: -1 }),
    ).toThrow('Los intentos fallidos');
  });

  it('al serializarse no incluye el hash', () => {
    const codigo = nuevo();
    expect(JSON.stringify(codigo)).not.toContain('hash-del-codigo');
    expect(codigo.toJSON()).toMatchObject({
      id: 'id-codigo',
      idUsuario: 'id-cliente',
      generadoPor: 'id-vendedor',
    });
  });

  it('CODIGO_INVALIDO: el mismo mensaje y sin detalles para cualquier motivo', () => {
    for (const motivo of [
      'NO_CLIENTE',
      'SIN_CODIGO',
      'VENCIDO',
      'AGOTADO',
      'CODIGO_INCORRECTO',
    ] as const) {
      const error = new CodigoRecuperacionInvalidoError(motivo);
      expect(error.codigo).toBe('CODIGO_INVALIDO');
      expect(error.categoria).toBe('REGLA_NEGOCIO');
      expect(error.message).toBe(MENSAJE_CODIGO_INVALIDO);
      expect(error.detalles).toBeUndefined();
    }
    expect(MENSAJE_CODIGO_INVALIDO).toBe(
      'El código no es válido o ya venció. Pide uno nuevo a tu vendedor.',
    );
  });
});
