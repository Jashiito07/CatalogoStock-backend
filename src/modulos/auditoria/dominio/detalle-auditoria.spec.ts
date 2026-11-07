import {
  CAMPOS_MAXIMOS,
  LONGITUD_MAXIMA_CORREO,
  LONGITUD_MAXIMA_TEXTO,
  normalizarCorreoIntentado,
  sanearDetalle,
} from './detalle-auditoria.js';

describe('Seguridad / D-20: salvaguarda del detalle de la bitácora', () => {
  it('conserva los detalles del contrato tal cual', () => {
    const casos = [
      { rol: 'CLIENTE' },
      { origen: 'COMANDO_SEMILLA' },
      { rol: 'VENDEDOR', canal: 'PANEL' },
      { familiaRevocada: true },
      { metodo: 'GET', ruta: '/api/v1/auditoria', rolUsuario: 'CLIENTE' },
      {},
    ];
    for (const detalle of casos) {
      expect(sanearDetalle('SESION_INICIADA', detalle)).toEqual({
        detalle,
        descartados: [],
      });
    }
  });

  it('sin detalle devuelve un objeto vacío y congelado', () => {
    const { detalle } = sanearDetalle('SESION_CERRADA', undefined);
    expect(detalle).toEqual({});
    expect(Object.isFrozen(detalle)).toBe(true);
  });

  it.each([
    'clave',
    'claveIntentada',
    'contraseña',
    'password',
    'hashClave',
    'hash',
    'token',
    'tokenRenovacion',
    'tokenAcceso',
    'jwt',
    'secreto',
    'authorization',
    'cookie',
    'telefono',
    'celular',
    'numeroTarjeta',
    'cvv',
    'cuentaBancaria',
    'banco',
    'comprobante',
    'cuerpo',
    'body',
    'cedula',
    'direccion',
    'correo',
    'email',
    'nombre',
    'apellidos',
  ])('elimina el campo prohibido «%s»', (campo) => {
    const resultado = sanearDetalle('ACCESO_DENEGADO', {
      [campo]: 'valor',
      rolUsuario: 'CLIENTE',
    });

    expect(resultado.detalle).toEqual({ rolUsuario: 'CLIENTE' });
    // «contraseña» no es un identificador ASCII: se avisa sin su nombre.
    expect(resultado.descartados).toHaveLength(1);
  });

  it.each([
    ['un hash bcrypt', '$2b$12$abcdefghijklmnopqrstuv'],
    ['un JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firmaFalsaParaLaPrueba'],
    ['un correo', 'maria@correo.com'],
    ['un celular en E.164', '+593991234567'],
    ['un celular local', '0991234567'],
    ['una tarjeta', '4111111111111111'],
    ['un token opaco', 'q9ZxR2t7LmN0pQ4sV8wY1bC3dE5fG6hJ7kL9mN0pQ2r'],
    ['un hash hexadecimal', 'a'.repeat(64)],
  ])(
    'elimina un valor con forma de secreto o dato personal: %s',
    (_caso, valor) => {
      const resultado = sanearDetalle('ACCESO_DENEGADO', { motivo: valor });

      expect(resultado.detalle).toEqual({});
      expect(resultado.descartados).toEqual(['motivo']);
    },
  );

  it('elimina un número largo (tarjeta o cuenta enviada como número)', () => {
    expect(
      sanearDetalle('ACCESO_DENEGADO', { cantidad: 4111111111111111, total: 3 })
        .detalle,
    ).toEqual({ total: 3 });
  });

  it('permite identificadores UUID en el texto (no son datos personales)', () => {
    const ruta =
      '/api/v1/pruebas/usuarios/00000000-0000-4000-8000-000000000001/desactivar';
    expect(sanearDetalle('ACCESO_DENEGADO', { ruta }).detalle).toEqual({
      ruta,
    });
  });

  it('elimina valores que no son simples: objetos, listas, indefinidos, infinitos o funciones', () => {
    const resultado = sanearDetalle('ACCESO_DENEGADO', {
      anidado: { clave: 'x' },
      lista: ['a'],
      indefinido: undefined,
      infinito: Number.POSITIVE_INFINITY,
      noNumero: Number.NaN,
      funcion: () => 'x',
      ok: null,
    });

    expect(resultado.detalle).toEqual({ ok: null });
    expect(resultado.descartados).toEqual([
      'anidado',
      'lista',
      'indefinido',
      'infinito',
      'noNumero',
      'funcion',
    ]);
  });

  it('elimina nombres de campo que no son identificadores y no los muestra en el aviso', () => {
    const resultado = sanearDetalle('ACCESO_DENEGADO', {
      'maria@correo.com': 'x',
      __proto__x: 'y',
      ['a'.repeat(51)]: 'z',
    });

    expect(resultado.detalle).toEqual({});
    expect(resultado.descartados).toEqual([
      '(nombre no válido)',
      '(nombre no válido)',
      'a'.repeat(50),
    ]);
  });

  it('recorta los textos largos', () => {
    const { detalle } = sanearDetalle('ACCESO_DENEGADO', {
      ruta: `/${'x/'.repeat(400)}`,
    });
    expect(String(detalle.ruta)).toHaveLength(LONGITUD_MAXIMA_TEXTO);
  });

  it(`guarda como máximo ${CAMPOS_MAXIMOS} campos`, () => {
    const muchos = Object.fromEntries(
      Array.from({ length: CAMPOS_MAXIMOS + 2 }, (_, i) => [`campo${i}`, i]),
    );
    const resultado = sanearDetalle('ACCESO_DENEGADO', muchos);

    expect(Object.keys(resultado.detalle)).toHaveLength(CAMPOS_MAXIMOS);
    expect(resultado.descartados).toEqual([
      `campo${CAMPOS_MAXIMOS}`,
      `campo${CAMPOS_MAXIMOS + 1}`,
    ]);
  });

  describe('D-20: única excepción, el correo intentado de SESION_FALLIDA', () => {
    it('se guarda sin espacios alrededor y en minúsculas', () => {
      expect(
        sanearDetalle('SESION_FALLIDA', {
          correo: '  Maria.Zambrano@Correo.COM ',
          canal: 'APP',
          motivo: 'CREDENCIALES_INVALIDAS',
        }).detalle,
      ).toEqual({
        correo: 'maria.zambrano@correo.com',
        canal: 'APP',
        motivo: 'CREDENCIALES_INVALIDAS',
      });
    });

    it(`se recorta a ${LONGITUD_MAXIMA_CORREO} caracteres`, () => {
      const largo = `${'A'.repeat(300)}@correo.com`;
      const { detalle } = sanearDetalle('SESION_FALLIDA', { correo: largo });
      expect(detalle.correo).toBe('a'.repeat(LONGITUD_MAXIMA_CORREO));
      expect(normalizarCorreoIntentado(largo)).toHaveLength(
        LONGITUD_MAXIMA_CORREO,
      );
    });

    it('se guarda aunque no tenga formato de correo (es lo que se intentó)', () => {
      expect(
        sanearDetalle('SESION_FALLIDA', { correo: 'No Es Correo' }).detalle,
      ).toEqual({ correo: 'no es correo' });
    });

    it('un correo que no es texto se descarta', () => {
      expect(sanearDetalle('SESION_FALLIDA', { correo: 5 })).toEqual({
        detalle: {},
        descartados: ['correo'],
      });
    });

    it('la clave intentada nunca se guarda, tampoco en SESION_FALLIDA', () => {
      const resultado = sanearDetalle('SESION_FALLIDA', {
        correo: 'a@b.co',
        clave: 'Catalogo2026',
        claveIntentada: 'Catalogo2026',
      });
      expect(resultado.detalle).toEqual({ correo: 'a@b.co' });
      expect(JSON.stringify(resultado)).not.toContain('Catalogo2026');
    });

    it('en cualquier otra acción el correo se elimina', () => {
      for (const accion of ['SESION_INICIADA', 'ACCESO_DENEGADO'] as const) {
        expect(
          sanearDetalle(accion, { correo: 'maria@correo.com' }).detalle,
        ).toEqual({});
      }
    });
  });
});
