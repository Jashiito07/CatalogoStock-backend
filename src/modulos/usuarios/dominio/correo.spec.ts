import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import { Correo, MENSAJE_CORREO_INVALIDO } from './correo.js';

describe('RF-USU-01 / contrato de usuarios: objeto de valor Correo', () => {
  it('Dado un correo con mayúsculas y espacios, cuando se crea, entonces se guarda recortado y en minúsculas', () => {
    expect(Correo.crear('  Maria.Zambrano@Correo.COM ').valor).toBe(
      'maria.zambrano@correo.com',
    );
  });

  it.each([
    'cliente@correo.com',
    'nombre.apellido+catalogo@sub.dominio.ec',
    "o'connor@correo.com",
    'a@b.co',
  ])('acepta el correo válido %s', (valor) => {
    expect(Correo.crear(valor).valor).toBe(valor.toLowerCase());
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['sin arroba', 'cliente.correo.com'],
    ['dos arrobas', 'cli@ente@correo.com'],
    ['sin dominio', 'cliente@'],
    ['sin parte local', '@correo.com'],
    ['dominio sin punto', 'cliente@localhost'],
    ['espacio interno', 'cli ente@correo.com'],
    ['puntos seguidos', 'cli..ente@correo.com'],
    ['dominio que empieza con guion', 'cliente@-correo.com'],
  ])('rechaza un correo %s', (_caso, valor) => {
    expect(() => Correo.crear(valor)).toThrow(DatosInvalidosError);
  });

  it('rechaza un correo de más de 254 caracteres y acepta uno de 254', () => {
    const dominio = '@correo.com';
    const local254 = 'a'.repeat(254 - dominio.length);
    expect(Correo.crear(`${local254}${dominio}`).valor).toHaveLength(254);
    expect(() => Correo.crear(`a${local254}${dominio}`)).toThrow(
      DatosInvalidosError,
    );
  });

  it.each([undefined, null, 42, {}])(
    'rechaza un valor que no es texto (%s)',
    (valor) => {
      expect(() => Correo.crear(valor)).toThrow(DatosInvalidosError);
    },
  );

  it('el error usa el mensaje del contrato, nombra el campo y no repite el valor', () => {
    let error: unknown;
    try {
      Correo.crear('dato-personal-sin-arroba');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DatosInvalidosError);
    const datos = error as DatosInvalidosError;
    expect(datos.codigo).toBe('DATOS_INVALIDOS');
    expect(datos.message).toBe(MENSAJE_CORREO_INVALIDO);
    expect(datos.detalles).toEqual({
      errores: [{ campo: 'correo', errores: [MENSAJE_CORREO_INVALIDO] }],
    });
    expect(JSON.stringify(datos.detalles)).not.toContain('dato-personal');
  });

  it('dos correos que solo difieren en mayúsculas son iguales', () => {
    expect(
      Correo.crear('Vendedor@Correo.com').esIgualA(
        Correo.crear('vendedor@correo.COM'),
      ),
    ).toBe(true);
    expect(
      Correo.crear('a@correo.com').esIgualA(Correo.crear('b@correo.com')),
    ).toBe(false);
  });

  it('se serializa como texto', () => {
    const correo = Correo.crear('A@B.com');
    expect(String(correo)).toBe('a@b.com');
    expect(JSON.stringify({ correo })).toBe('{"correo":"a@b.com"}');
  });
});
