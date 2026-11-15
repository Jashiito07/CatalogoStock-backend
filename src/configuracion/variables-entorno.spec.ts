import {
  obtenerOrigenesCors,
  validarVariablesEntorno,
} from './variables-entorno.js';

const VARIABLES_VALIDAS = {
  PUERTO: '3000',
  CORS_ORIGENES: 'http://localhost:4200,http://localhost:8100',
  BD_HOST: 'localhost',
  BD_PUERTO: '5432',
  BD_NOMBRE: 'catalogostock_pruebas',
  BD_USUARIO: 'usuario_falso',
  BD_CLAVE: 'clave_falsa',
  JWT_SECRETO: 'secreto_falso_de_pruebas_con_32_caracteres_o_mas',
  RECUPERACION_SECRETO: 'otro_secreto_falso_de_pruebas_de_32_caracteres',
  CORREO_ACTIVO: 'false',
};

/** Variables SMTP falsas para probar CORREO_ACTIVO=true (nada real). */
const VARIABLES_SMTP = {
  SMTP_SERVIDOR: 'smtp.ejemplo.test',
  SMTP_PUERTO: '465',
  SMTP_USUARIO: 'cuenta.falsa@ejemplo.test',
  SMTP_CLAVE: 'clave-de-aplicacion-falsa',
  CORREO_REMITENTE: 'CatálogoStock <cuenta.falsa@ejemplo.test>',
};

describe('Configuración: validación de variables de entorno al arrancar', () => {
  it('acepta variables válidas y convierte los puertos a número', () => {
    const variables = validarVariablesEntorno({ ...VARIABLES_VALIDAS });

    expect(variables.PUERTO).toBe(3000);
    expect(variables.BD_PUERTO).toBe(5432);
    expect(variables.BD_NOMBRE).toBe('catalogostock_pruebas');
  });

  it.each(Object.keys(VARIABLES_VALIDAS))(
    'falla si falta la variable obligatoria %s',
    (nombre) => {
      const variables: Record<string, unknown> = { ...VARIABLES_VALIDAS };
      delete variables[nombre];

      expect(() => validarVariablesEntorno(variables)).toThrow(nombre);
    },
  );

  it.each([
    ['PUERTO', 'abc'],
    ['PUERTO', '70000'],
    ['BD_PUERTO', '0'],
    ['BD_HOST', ''],
  ])('falla si %s tiene un valor inválido ("%s")', (nombre, valor) => {
    expect(() =>
      validarVariablesEntorno({ ...VARIABLES_VALIDAS, [nombre]: valor }),
    ).toThrow(nombre);
  });

  it('D-08: BCRYPT_COSTO es opcional y vale 12 si no se define', () => {
    expect(validarVariablesEntorno({ ...VARIABLES_VALIDAS }).BCRYPT_COSTO).toBe(
      12,
    );
  });

  it('D-08: BCRYPT_COSTO acepta un entero de 10 a 14', () => {
    expect(
      validarVariablesEntorno({ ...VARIABLES_VALIDAS, BCRYPT_COSTO: '10' })
        .BCRYPT_COSTO,
    ).toBe(10);
  });

  it.each(['9', '15', 'doce', '12.5'])(
    'D-08: BCRYPT_COSTO rechaza el valor "%s"',
    (valor) => {
      expect(() =>
        validarVariablesEntorno({ ...VARIABLES_VALIDAS, BCRYPT_COSTO: valor }),
      ).toThrow('BCRYPT_COSTO');
    },
  );

  it('D-09: la vida de los tokens es opcional y vale 900 s y 7 días por defecto', () => {
    const variables = validarVariablesEntorno({ ...VARIABLES_VALIDAS });

    expect(variables.JWT_VIDA_ACCESO_SEGUNDOS).toBe(900);
    expect(variables.RENOVACION_VIDA_DIAS).toBe(7);
    expect(variables.PROXY_SALTOS_CONFIABLES).toBe(0);
  });

  it('D-46: RUTA_ALMACENAMIENTO es opcional (por defecto ./almacenamiento), se puede cambiar y no admite vacío', () => {
    expect(
      validarVariablesEntorno({ ...VARIABLES_VALIDAS }).RUTA_ALMACENAMIENTO,
    ).toBe('./almacenamiento');
    expect(
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        RUTA_ALMACENAMIENTO: '/var/lib/catalogostock',
      }).RUTA_ALMACENAMIENTO,
    ).toBe('/var/lib/catalogostock');
    expect(() =>
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        RUTA_ALMACENAMIENTO: '',
      }),
    ).toThrow('RUTA_ALMACENAMIENTO');
  });

  it.each([
    ['JWT_SECRETO', 'corto'],
    ['JWT_VIDA_ACCESO_SEGUNDOS', '30'],
    ['JWT_VIDA_ACCESO_SEGUNDOS', 'quince'],
    ['RENOVACION_VIDA_DIAS', '0'],
    ['RENOVACION_VIDA_DIAS', '31'],
    ['PROXY_SALTOS_CONFIABLES', '-1'],
  ])('D-09: rechaza %s = "%s"', (nombre, valor) => {
    expect(() =>
      validarVariablesEntorno({ ...VARIABLES_VALIDAS, [nombre]: valor }),
    ).toThrow(nombre);
  });

  it('el error de JWT_SECRETO no muestra el secreto', () => {
    let mensaje = '';
    try {
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        JWT_SECRETO: 'secreto-x',
      });
    } catch (error) {
      mensaje = (error as Error).message;
    }
    expect(mensaje).toContain('JWT_SECRETO');
    expect(mensaje).not.toContain('secreto-x');
  });

  it('RF-USU-05: RECUPERACION_SECRETO exige 32 caracteres y el error no muestra el secreto', () => {
    let mensaje = '';
    try {
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        RECUPERACION_SECRETO: 'secreto-corto-31-caracteres-abc',
      });
    } catch (error) {
      mensaje = (error as Error).message;
    }
    expect(mensaje).toContain('RECUPERACION_SECRETO');
    expect(mensaje).not.toContain('secreto-corto');
    expect(
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        RECUPERACION_SECRETO: 'x'.repeat(32),
      }).RECUPERACION_SECRETO,
    ).toHaveLength(32);
  });

  describe('D-50: correo (CORREO_ACTIVO y SMTP_*)', () => {
    it('con CORREO_ACTIVO=false no se exigen las variables SMTP_* ni CORREO_REMITENTE', () => {
      const variables = validarVariablesEntorno({ ...VARIABLES_VALIDAS });

      expect(variables.CORREO_ACTIVO).toBe(false);
    });

    it('con CORREO_ACTIVO=true acepta la configuración SMTP y convierte el puerto', () => {
      const variables = validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        CORREO_ACTIVO: 'true',
        ...VARIABLES_SMTP,
      });

      expect(variables.CORREO_ACTIVO).toBe(true);
      expect(variables.SMTP_PUERTO).toBe(465);
      expect(variables.SMTP_SERVIDOR).toBe('smtp.ejemplo.test');
    });

    it.each(Object.keys(VARIABLES_SMTP))(
      'con CORREO_ACTIVO=true falla si falta %s',
      (nombre) => {
        const variables: Record<string, unknown> = {
          ...VARIABLES_VALIDAS,
          CORREO_ACTIVO: 'true',
          ...VARIABLES_SMTP,
        };
        delete variables[nombre];

        expect(() => validarVariablesEntorno(variables)).toThrow(nombre);
      },
    );

    it.each(['si', '1', 'TRUE', ''])(
      'CORREO_ACTIVO rechaza el valor "%s" (solo true o false)',
      (valor) => {
        expect(() =>
          validarVariablesEntorno({
            ...VARIABLES_VALIDAS,
            CORREO_ACTIVO: valor,
          }),
        ).toThrow('CORREO_ACTIVO');
      },
    );

    it.each(['0', '65536', 'smtp'])(
      'con CORREO_ACTIVO=true rechaza SMTP_PUERTO = "%s"',
      (valor) => {
        expect(() =>
          validarVariablesEntorno({
            ...VARIABLES_VALIDAS,
            CORREO_ACTIVO: 'true',
            ...VARIABLES_SMTP,
            SMTP_PUERTO: valor,
          }),
        ).toThrow('SMTP_PUERTO');
      },
    );

    it('el error no muestra la contraseña SMTP ni el usuario', () => {
      let mensaje = '';
      try {
        validarVariablesEntorno({
          ...VARIABLES_VALIDAS,
          CORREO_ACTIVO: 'true',
          ...VARIABLES_SMTP,
          SMTP_PUERTO: 'no-es-un-puerto',
        });
      } catch (error) {
        mensaje = (error as Error).message;
      }
      expect(mensaje).toContain('SMTP_PUERTO');
      expect(mensaje).not.toContain(VARIABLES_SMTP.SMTP_CLAVE);
      expect(mensaje).not.toContain(VARIABLES_SMTP.SMTP_USUARIO);
    });
  });

  it('el error no expone el valor de los secretos', () => {
    let mensaje = '';
    try {
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        PUERTO: 'clave_secreta',
      });
    } catch (error) {
      mensaje = (error as Error).message;
    }
    expect(mensaje).toContain('PUERTO');
    expect(mensaje).not.toContain('clave_secreta');
  });
});

describe('obtenerOrigenesCors', () => {
  it('separa por comas, quita espacios y vacíos', () => {
    expect(obtenerOrigenesCors(' http://a.test , http://b.test,, ')).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });
});
