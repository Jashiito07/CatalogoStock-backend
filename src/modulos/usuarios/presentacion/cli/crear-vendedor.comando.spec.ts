import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import type {
  DatosCrearVendedor,
  ResultadoCrearVendedor,
} from '../../aplicacion/casos-uso/crear-vendedor.caso-uso.js';
import { validarFortalezaClave } from '../../dominio/clave.js';
import { CorreoYaRegistradoError } from '../../dominio/errores-usuario.js';
import {
  ejecutarComandoCrearVendedor,
  leerDatosVendedor,
  type LectorVariables,
  VariablesVendedorFaltantesError,
} from './crear-vendedor.comando.js';

const ENTORNO: Record<string, string> = {
  VENDEDOR_NOMBRE: 'Vendedor de Prueba',
  VENDEDOR_CORREO: 'vendedor.secreto@ejemplo.test',
  VENDEDOR_TELEFONO: '0991234567',
  VENDEDOR_CLAVE: 'ClaveMuySecreta2026',
};

function lector(entorno: Record<string, string | undefined>): LectorVariables {
  return (nombre) => entorno[nombre];
}

function salidaEnMemoria() {
  const mensajes: string[] = [];
  return {
    mensajes,
    salida: {
      informar: (mensaje: string) => mensajes.push(mensaje),
      error: (mensaje: string) => mensajes.push(mensaje),
    },
  };
}

function casoUsoQue(
  ejecutar: (datos: DatosCrearVendedor) => Promise<ResultadoCrearVendedor>,
) {
  return {
    ejecutar:
      vi.fn<(datos: DatosCrearVendedor) => Promise<ResultadoCrearVendedor>>(
        ejecutar,
      ),
  };
}

/** Ningún mensaje del comando contiene la clave, el correo ni el teléfono. */
function expectSinDatosSensibles(mensajes: string[]): void {
  const texto = mensajes.join('\n');
  expect(texto).not.toContain(ENTORNO.VENDEDOR_CLAVE);
  expect(texto).not.toContain(ENTORNO.VENDEDOR_CORREO);
  expect(texto).not.toContain(ENTORNO.VENDEDOR_TELEFONO);
  expect(texto).not.toContain('$2b$');
}

describe('D-07: comando npm run crear-vendedor', () => {
  describe('leerDatosVendedor', () => {
    it('lee las cuatro variables del contrato', () => {
      expect(leerDatosVendedor(lector(ENTORNO))).toEqual({
        nombre: 'Vendedor de Prueba',
        correo: 'vendedor.secreto@ejemplo.test',
        telefono: '0991234567',
        clave: 'ClaveMuySecreta2026',
      });
    });

    it('si faltan variables o están vacías falla nombrándolas, sin sus valores', () => {
      let error: unknown;
      try {
        leerDatosVendedor(
          lector({
            ...ENTORNO,
            VENDEDOR_CLAVE: undefined,
            VENDEDOR_TELEFONO: '  ',
          }),
        );
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(VariablesVendedorFaltantesError);
      const faltantes = error as VariablesVendedorFaltantesError;
      expect(faltantes.faltantes).toEqual([
        'VENDEDOR_TELEFONO',
        'VENDEDOR_CLAVE',
      ]);
      expect(faltantes.message).not.toContain(ENTORNO.VENDEDOR_CORREO);
    });
  });

  it('cuando crea el Vendedor informa solo su id y termina con código 0', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const casoUso = casoUsoQue(() =>
      Promise.resolve({ creado: true, idUsuario: 'id-vendedor-1' }),
    );

    const codigo = await ejecutarComandoCrearVendedor(
      casoUso,
      lector(ENTORNO),
      salida,
    );

    expect(codigo).toBe(0);
    expect(casoUso.ejecutar).toHaveBeenCalledWith({
      nombre: ENTORNO.VENDEDOR_NOMBRE,
      correo: ENTORNO.VENDEDOR_CORREO,
      telefono: ENTORNO.VENDEDOR_TELEFONO,
      clave: ENTORNO.VENDEDOR_CLAVE,
    });
    expect(mensajes).toEqual(['Vendedor creado (id: id-vendedor-1).']);
    expectSinDatosSensibles(mensajes);
  });

  it('PA-09: si ya existe un Vendedor informa que no hubo cambios y termina con código 0', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const casoUso = casoUsoQue(() =>
      Promise.resolve({ creado: false, motivo: 'VENDEDOR_EXISTENTE' }),
    );

    const codigo = await ejecutarComandoCrearVendedor(
      casoUso,
      lector(ENTORNO),
      salida,
    );

    expect(codigo).toBe(0);
    expect(mensajes[0]).toContain('no se hizo ningún cambio');
    expectSinDatosSensibles(mensajes);
  });

  it('con una clave débil termina con código 1, indica la variable y no muestra la clave', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const casoUso = casoUsoQue((datos) => {
      validarFortalezaClave(datos.clave);
      return Promise.resolve({ creado: true, idUsuario: 'no-llega' });
    });

    const codigo = await ejecutarComandoCrearVendedor(
      casoUso,
      lector({ ...ENTORNO, VENDEDOR_CLAVE: 'debil' }),
      salida,
    );

    expect(codigo).toBe(1);
    expect(mensajes[0]).toContain('VENDEDOR_CLAVE');
    expect(mensajes[0]).toContain('DATOS_INVALIDOS');
    expect(mensajes[0]).not.toContain('debil');
  });

  it('un error de dominio sin campo se informa con su código', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const casoUso = casoUsoQue(() =>
      Promise.reject(new CorreoYaRegistradoError()),
    );

    const codigo = await ejecutarComandoCrearVendedor(
      casoUso,
      lector(ENTORNO),
      salida,
    );

    expect(codigo).toBe(1);
    expect(mensajes[0]).toContain('CORREO_YA_REGISTRADO');
    expect(mensajes[0]).not.toContain('Revise');
    expectSinDatosSensibles(mensajes);
  });

  it('un campo con un nombre inesperado no se usa para armar el mensaje', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const casoUso = casoUsoQue(() =>
      Promise.reject(
        new DatosInvalidosError('Dato inválido.', {
          errores: [{ campo: 'a.b; DROP', errores: [] }],
        }),
      ),
    );

    await ejecutarComandoCrearVendedor(casoUso, lector(ENTORNO), salida);

    expect(mensajes[0]).not.toContain('Revise');
  });

  it('si faltan variables termina con código 1 sin llamar al caso de uso', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const casoUso = casoUsoQue(() =>
      Promise.resolve({ creado: true, idUsuario: 'no-llega' }),
    );

    const codigo = await ejecutarComandoCrearVendedor(
      casoUso,
      lector({}),
      salida,
    );

    expect(codigo).toBe(1);
    expect(casoUso.ejecutar).not.toHaveBeenCalled();
    expect(mensajes[0]).toContain('VENDEDOR_NOMBRE');
  });

  it('un error inesperado no expone su mensaje (puede contener datos)', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const casoUso = casoUsoQue(() =>
      Promise.reject(
        Object.assign(new Error(`fallo con ${ENTORNO.VENDEDOR_CORREO}`), {
          code: 'ECONNREFUSED',
        }),
      ),
    );

    const codigo = await ejecutarComandoCrearVendedor(
      casoUso,
      lector(ENTORNO),
      salida,
    );

    expect(codigo).toBe(1);
    expect(mensajes[0]).toContain('ECONNREFUSED');
    expectSinDatosSensibles(mensajes);
  });
});
