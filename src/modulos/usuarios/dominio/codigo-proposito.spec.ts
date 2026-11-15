import {
  CodigoRecuperacion,
  CodigoRecuperacionInvalidoError,
  ENVIOS_MAXIMOS_POR_VENTANA,
  finVentanaEnvios,
  inicioVentanaEnvios,
  MENSAJE_CODIGO_INVALIDO,
  MENSAJE_CODIGO_VERIFICACION_INVALIDO,
  PROPOSITOS_CODIGO,
  type PropositoCodigo,
  propositosDelGrupo,
} from './codigo-recuperacion.js';
import {
  CorreoNoDisponibleError,
  CorreoYaVerificadoError,
  DemasiadosEnviosCodigoError,
} from './errores-correo.js';

const AHORA = new Date('2026-11-11T15:00:00.000Z');
const HORA = 60 * 60 * 1000;

function codigo(
  proposito: PropositoCodigo,
  generadoPor: string | null,
): CodigoRecuperacion {
  return CodigoRecuperacion.generar({
    id: 'id-codigo',
    idUsuario: 'id-usuario',
    hashCodigo: 'hash',
    proposito,
    generadoPor,
    ahora: AHORA,
  });
}

describe('Contrato de correo: propósito del código (dominio)', () => {
  it('hay tres propósitos y la recuperación asistida y por correo se reemplazan entre sí; la verificación va aparte', () => {
    expect(PROPOSITOS_CODIGO).toEqual([
      'RECUPERACION_ASISTIDA',
      'RECUPERACION_CORREO',
      'VERIFICACION_CORREO',
    ]);
    expect(propositosDelGrupo('RECUPERACION_ASISTIDA')).toEqual([
      'RECUPERACION_ASISTIDA',
      'RECUPERACION_CORREO',
    ]);
    expect(propositosDelGrupo('RECUPERACION_CORREO')).toEqual(
      propositosDelGrupo('RECUPERACION_ASISTIDA'),
    );
    expect(propositosDelGrupo('VERIFICACION_CORREO')).toEqual([
      'VERIFICACION_CORREO',
    ]);
  });

  it('un código del sistema (correo) no tiene Vendedor; el asistido sí lo exige', () => {
    expect(codigo('RECUPERACION_CORREO', null).generadoPor).toBeNull();
    expect(codigo('VERIFICACION_CORREO', null).proposito).toBe(
      'VERIFICACION_CORREO',
    );
    expect(() => codigo('RECUPERACION_ASISTIDA', null)).toThrow(
      'debe indicar el Vendedor',
    );
  });

  it('rechaza un propósito desconocido guardado en la base', () => {
    const base = codigo('RECUPERACION_CORREO', null).toJSON();
    expect(() =>
      CodigoRecuperacion.reconstituir({
        ...base,
        hashCodigo: 'hash',
        proposito: 'OTRO' as PropositoCodigo,
      }),
    ).toThrow('propósito inválido');
  });

  it('D-17: 3 envíos por hora; la ventana termina en «ahora» y se libera una hora después del más antiguo', () => {
    expect(ENVIOS_MAXIMOS_POR_VENTANA).toBe(3);
    expect(inicioVentanaEnvios(AHORA)).toEqual(new Date(AHORA.getTime() - HORA));
    expect(finVentanaEnvios(AHORA)).toEqual(new Date(AHORA.getTime() + HORA));
  });

  it('la verificación del correo tiene su propio mensaje único de código inválido', () => {
    const error = new CodigoRecuperacionInvalidoError(
      'VENCIDO',
      MENSAJE_CODIGO_VERIFICACION_INVALIDO,
    );
    expect(error.codigo).toBe('CODIGO_INVALIDO');
    expect(error.message).toBe(
      'El código no es válido o ya venció. Pide uno nuevo.',
    );
    expect(new CodigoRecuperacionInvalidoError('VENCIDO').message).toBe(
      MENSAJE_CODIGO_INVALIDO,
    );
  });

  it('errores del correo: 409, 503 genérico y 429 con el tiempo de espera', () => {
    const yaVerificado = new CorreoYaVerificadoError();
    expect(yaVerificado).toMatchObject({
      codigo: 'CORREO_YA_VERIFICADO',
      categoria: 'CONFLICTO',
    });
    const noDisponible = new CorreoNoDisponibleError();
    expect(noDisponible).toMatchObject({
      codigo: 'CORREO_NO_DISPONIBLE',
      categoria: 'SERVICIO_NO_DISPONIBLE',
    });
    expect(noDisponible.detalles).toBeUndefined();
    const demasiados = new DemasiadosEnviosCodigoError(120);
    expect(demasiados).toMatchObject({
      codigo: 'DEMASIADAS_SOLICITUDES',
      categoria: 'DEMASIADAS_SOLICITUDES',
      detalles: { reintentarEnSegundos: 120 },
    });
  });
});
