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
