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
