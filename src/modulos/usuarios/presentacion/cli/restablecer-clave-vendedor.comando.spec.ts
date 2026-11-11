import {
  validarClaveNueva,
  VendedorNoExisteError,
} from '../../dominio/cambio-clave.js';
import { ejecutarComandoRestablecerClaveVendedor } from './restablecer-clave-vendedor.comando.js';

const CLAVE = 'ClaveNueva2026';

function salidaEnMemoria() {
  const mensajes: string[] = [];
  return {
    mensajes,
    salida: {
      informar: (m: string) => mensajes.push(m),
      error: (m: string) => mensajes.push(m),
    },
  };
}

describe('D-35: comando npm run restablecer-clave-vendedor', () => {
  it('cambia la clave, informa el id y las sesiones cerradas, y nunca muestra la clave', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const ejecutar = vi.fn<
      (
        clave: string,
      ) => Promise<{ idUsuario: string; sesionesRevocadas: number }>
    >((clave: string) => {
      validarClaveNueva(clave);
      return Promise.resolve({
        idUsuario: 'id-vendedor',
        sesionesRevocadas: 2,
      });
    });

    const codigo = await ejecutarComandoRestablecerClaveVendedor(
      { ejecutar },
      () => CLAVE,
      salida,
    );

    expect(codigo).toBe(0);
    expect(ejecutar).toHaveBeenCalledWith(CLAVE);
    expect(mensajes[0]).toContain('id-vendedor');
    expect(mensajes[0]).toContain('Sesiones cerradas: 2');
    expect(mensajes.join()).not.toContain(CLAVE);
  });

  it('sin VENDEDOR_CLAVE_NUEVA termina con 1 sin llamar al caso de uso', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const ejecutar =
      vi.fn<
        (
          clave: string,
        ) => Promise<{ idUsuario: string; sesionesRevocadas: number }>
      >();
    expect(
      await ejecutarComandoRestablecerClaveVendedor(
        { ejecutar },
        () => '  ',
        salida,
      ),
    ).toBe(1);
    expect(ejecutar).not.toHaveBeenCalled();
    expect(mensajes[0]).toContain('VENDEDOR_CLAVE_NUEVA');
  });

  it('sin Vendedor termina con 1 y sugiere crear-vendedor', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    expect(
      await ejecutarComandoRestablecerClaveVendedor(
        { ejecutar: () => Promise.reject(new VendedorNoExisteError()) },
        () => CLAVE,
        salida,
      ),
    ).toBe(1);
    expect(mensajes[0]).toContain('npm run crear-vendedor');
  });

  it('una clave débil termina con 1, indica la variable y no muestra la clave', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    const codigo = await ejecutarComandoRestablecerClaveVendedor(
      {
        ejecutar: (clave: string) => {
          validarClaveNueva(clave);
          return Promise.resolve({ idUsuario: 'x', sesionesRevocadas: 0 });
        },
      },
      () => 'debil',
      salida,
    );
    expect(codigo).toBe(1);
    expect(mensajes[0]).toContain('VENDEDOR_CLAVE_NUEVA');
    expect(mensajes[0]).toContain('DATOS_INVALIDOS');
    expect(mensajes[0]).not.toContain('debil');
  });

  it('un error inesperado no expone su mensaje', async () => {
    const { mensajes, salida } = salidaEnMemoria();
    await ejecutarComandoRestablecerClaveVendedor(
      {
        ejecutar: () =>
          Promise.reject(
            Object.assign(new Error(`fallo ${CLAVE}`), {
              code: 'ECONNREFUSED',
            }),
          ),
      },
      () => CLAVE,
      salida,
    );
    expect(mensajes[0]).toContain('ECONNREFUSED');
    expect(mensajes[0]).not.toContain(CLAVE);
  });
});
