import { Sesion } from '../../dominio/sesion.js';
import { CambiarClaveCasoUso } from './cambiar-clave.caso-uso.js';
import {
  AuditoriaFalsa,
  CodigoRecuperacionRepositorioEnMemoria,
  crearCliente,
  crearVendedor,
  desactivar,
  GeneradorHashFalso,
  GeneradorTokenFalso,
  generadorIdSecuencial,
  INICIO,
  ProtectorCodigoFalso,
  RelojFalso,
  SesionRepositorioEnMemoria,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import { GenerarCodigoRecuperacionCasoUso } from './generar-codigo-recuperacion.caso-uso.js';
import { ListarClientesCasoUso } from './listar-clientes.caso-uso.js';
import { RecuperarClaveCasoUso } from './recuperar-clave.caso-uso.js';
import { RestablecerClaveVendedorCasoUso } from './restablecer-clave-vendedor.caso-uso.js';

const ID_CLIENTE = '00000000-0000-4000-8000-0000000000c1';
const ID_VENDEDOR = '00000000-0000-4000-8000-0000000000v1';
const CORREO_CLIENTE = 'maria@ejemplo.test';
const CLAVE_NUEVA = 'NuevaClave2026';
const MINUTO = 60 * 1000;

function contexto() {
  const usuarios = new UsuarioRepositorioEnMemoria();
  const sesiones = new SesionRepositorioEnMemoria();
  const codigos = new CodigoRecuperacionRepositorioEnMemoria();
  const protector = new ProtectorCodigoFalso();
  const hash = new GeneradorHashFalso();
  const token = new GeneradorTokenFalso();
  const reloj = new RelojFalso(INICIO);
  const unidad = new UnidadDeTrabajoFalsa();
  const auditoria = new AuditoriaFalsa(unidad);
  const ids = generadorIdSecuencial();

  usuarios.usuarios.push(
    crearCliente(ID_CLIENTE, CORREO_CLIENTE),
    crearVendedor(ID_VENDEDOR, 'vendedor@ejemplo.test'),
  );

  const generar = new GenerarCodigoRecuperacionCasoUso(
    usuarios,
    codigos,
    protector,
    ids,
    reloj,
    unidad,
    auditoria,
  );
  const recuperar = new RecuperarClaveCasoUso(
    usuarios,
    sesiones,
    codigos,
    protector,
    hash,
    reloj,
    unidad,
    auditoria,
  );
  const cambiar = new CambiarClaveCasoUso(
    usuarios,
    sesiones,
    hash,
    token,
    reloj,
    unidad,
    auditoria,
  );
  const restablecer = new RestablecerClaveVendedorCasoUso(
    usuarios,
    sesiones,
    hash,
    reloj,
    unidad,
    auditoria,
  );
  const listar = new ListarClientesCasoUso(usuarios, codigos, reloj);

  async function abrirSesion(idUsuario: string, n: number): Promise<string> {
    const valor = `tok-${idUsuario}-${n}`;
    await sesiones.crear(
      Sesion.iniciar({
        id: `s-${idUsuario}-${n}`,
        idUsuario,
        familia: `f-${idUsuario}-${n}`,
        canal: 'APP',
        hashToken: token.calcularHash(valor),
        ahora: reloj.ahora(),
        vidaDias: 7,
      }),
    );
    return valor;
  }

  return {
    usuarios,
    sesiones,
    codigos,
    protector,
    reloj,
    auditoria,
    generar,
    recuperar,
    cambiar,
    restablecer,
    listar,
    abrirSesion,
  };
}

describe('RF-USU-05: generar código de recuperación', () => {
  it('genera un código, guarda solo su hash y registra CODIGO_RECUPERACION_GENERADO sin el código, en la transacción', async () => {
    const c = contexto();
    const resultado = await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });

    expect(resultado.codigo).toBe('100001');
    expect(resultado.venceEn).toEqual(new Date(INICIO.getTime() + 15 * MINUTO));
    expect(resultado.cliente).toEqual({
      id: ID_CLIENTE,
      nombre: 'Cliente de Prueba',
      correo: CORREO_CLIENTE,
    });
    expect(c.codigos.codigos[0].hashCodigo).toBe('hmac(100001)');
    const [registro] = c.auditoria.registradas;
    expect(registro).toMatchObject({
      enTransaccion: true,
      actividad: {
        accion: 'CODIGO_RECUPERACION_GENERADO',
        idUsuario: ID_VENDEDOR,
        entidad: 'USUARIO',
        idEntidad: ID_CLIENTE,
        detalle: { venceEn: resultado.venceEn.toISOString() },
      },
    });
    expect(JSON.stringify(c.auditoria.registradas)).not.toContain('100001');
  });

  it('D-35: el Vendedor o un id inexistente → 404; un Cliente inactivo → 422 CUENTA_INACTIVA', async () => {
    const c = contexto();
    await expect(
      c.generar.ejecutar({ idVendedor: ID_VENDEDOR, idCliente: ID_VENDEDOR }),
    ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    await expect(
      c.generar.ejecutar({ idVendedor: ID_VENDEDOR, idCliente: 'otro' }),
    ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });

    c.usuarios.usuarios[0] = desactivar(c.usuarios.usuarios[0]);
    await expect(
      c.generar.ejecutar({ idVendedor: ID_VENDEDOR, idCliente: ID_CLIENTE }),
    ).rejects.toMatchObject({ codigo: 'CUENTA_INACTIVA' });
    expect(c.codigos.codigos).toHaveLength(0);
    expect(c.auditoria.registradas).toHaveLength(0);
  });

  it('generar uno nuevo invalida el anterior', async () => {
    const c = contexto();
    await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });
    await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });

    expect(c.codigos.codigos[0].invalidadoEn).not.toBeNull();
    expect(c.codigos.codigos[1].invalidadoEn).toBeNull();
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '100001',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
  });
});

describe('RF-USU-05: recuperar la clave con el código', () => {
  it('cambia el hash, marca el código como usado, revoca todas las sesiones y registra CLAVE_RESTABLECIDA en la transacción', async () => {
    const c = contexto();
    await c.abrirSesion(ID_CLIENTE, 1);
    await c.abrirSesion(ID_CLIENTE, 2);
    await c.abrirSesion(ID_VENDEDOR, 1);
    const { codigo } = await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });
    c.reloj.avanzar(MINUTO);

    await c.recuperar.ejecutar({
      correo: ' MARIA@ejemplo.test ',
      codigo,
      claveNueva: CLAVE_NUEVA,
    });

    expect(c.usuarios.usuarios[0].hashClave).toBe(`hash:${CLAVE_NUEVA}`);
    expect(c.codigos.codigos[0].usadoEn).toEqual(c.reloj.ahora());
    expect(
      c.sesiones.vigentes(c.reloj.ahora()).map((s) => s.idUsuario),
    ).toEqual([ID_VENDEDOR]);
    expect(c.auditoria.registradas.at(-1)).toMatchObject({
      enTransaccion: true,
      actividad: {
        accion: 'CLAVE_RESTABLECIDA',
        idUsuario: ID_CLIENTE,
        idEntidad: ID_CLIENTE,
        detalle: { origen: 'CODIGO_VENDEDOR', sesionesRevocadas: 2 },
      },
    });

    // Un solo uso.
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo,
        claveNueva: 'OtraClave2026',
      }),
    ).rejects.toMatchObject({
      codigo: 'CODIGO_INVALIDO',
      motivo: 'SIN_CODIGO',
    });
  });

  it.each([
    ['correo inexistente', 'nadie@ejemplo.test', 'NO_CLIENTE', null],
    ['correo del Vendedor', 'vendedor@ejemplo.test', 'NO_CLIENTE', ID_VENDEDOR],
    ['correo mal escrito', 'no-es-correo', 'NO_CLIENTE', null],
  ])(
    '%s → 422 CODIGO_INVALIDO y RECUPERACION_FALLIDA sin interrumpir',
    async (_caso, correo, motivo, idCuenta) => {
      const c = contexto();
      await c.generar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idCliente: ID_CLIENTE,
      });

      await expect(
        c.recuperar.ejecutar({
          correo,
          codigo: '100001',
          claveNueva: CLAVE_NUEVA,
        }),
      ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO', motivo });
      expect(c.auditoria.registradas.at(-1)).toMatchObject({
        sinInterrumpir: true,
        enTransaccion: false,
        actividad: {
          accion: 'RECUPERACION_FALLIDA',
          idUsuario: idCuenta,
          detalle: { correo, motivo },
        },
      });
    },
  );

  it('sin código generado → SIN_CODIGO; un Cliente inactivo → NO_CLIENTE', async () => {
    const c = contexto();
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '123456',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'SIN_CODIGO' });

    await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });
    c.usuarios.usuarios[0] = desactivar(c.usuarios.usuarios[0]);
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '100001',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'NO_CLIENTE' });
  });

  it('código vencido → VENCIDO y no suma intentos', async () => {
    const c = contexto();
    await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });
    c.reloj.avanzar(15 * MINUTO);

    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '100001',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'VENCIDO' });
    expect(c.codigos.codigos[0].intentosFallidos).toBe(0);
  });

  it('el quinto intento fallido invalida el código aunque luego se envíe el correcto', async () => {
    const c = contexto();
    await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });

    for (let i = 1; i <= 5; i++) {
      await expect(
        c.recuperar.ejecutar({
          correo: CORREO_CLIENTE,
          codigo: '999999',
          claveNueva: CLAVE_NUEVA,
        }),
      ).rejects.toMatchObject({ motivo: 'CODIGO_INCORRECTO' });
      expect(c.codigos.codigos[0].intentosFallidos).toBe(i);
    }
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '100001',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'AGOTADO' });
    expect(c.usuarios.usuarios[0].hashClave).not.toBe(`hash:${CLAVE_NUEVA}`);
  });

  it('si la bitácora falla, la respuesta sigue siendo el mismo 422', async () => {
    const c = contexto();
    c.auditoria.fallo = new Error('bitácora caída');
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '123456',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
  });

  it('defensa en profundidad: formato inválido → 400 sin tocar nada', async () => {
    const c = contexto();
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '12ab56',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: '123456',
        claveNueva: 'debil',
      }),
    ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
    expect(c.auditoria.registradas).toHaveLength(0);
  });
});

describe('RF-USU-05: cambiar la clave con sesión', () => {
  it('conserva la sesión del token actual, revoca las demás y registra CLAVE_CAMBIADA', async () => {
    const c = contexto();
    const actual = await c.abrirSesion(ID_CLIENTE, 1);
    await c.abrirSesion(ID_CLIENTE, 2);
    await c.abrirSesion(ID_CLIENTE, 3);

    await c.cambiar.ejecutar({
      idUsuario: ID_CLIENTE,
      claveActual: 'Catalogo2026',
      claveNueva: CLAVE_NUEVA,
      tokenRenovacionActual: actual,
    });

    expect(c.usuarios.usuarios[0].hashClave).toBe(`hash:${CLAVE_NUEVA}`);
    expect(c.sesiones.vigentes(c.reloj.ahora()).map((s) => s.id)).toEqual([
      `s-${ID_CLIENTE}-1`,
    ]);
    expect(c.auditoria.registradas.at(-1)).toMatchObject({
      enTransaccion: true,
      actividad: {
        accion: 'CLAVE_CAMBIADA',
        idUsuario: ID_CLIENTE,
        detalle: { sesionesRevocadas: 2 },
      },
    });
  });

  it('sin token, o con el token de otro usuario, revoca todas', async () => {
    const c = contexto();
    await c.abrirSesion(ID_CLIENTE, 1);
    const ajeno = await c.abrirSesion(ID_VENDEDOR, 1);

    await c.cambiar.ejecutar({
      idUsuario: ID_CLIENTE,
      claveActual: 'Catalogo2026',
      claveNueva: CLAVE_NUEVA,
      tokenRenovacionActual: ajeno,
    });
    expect(
      c.sesiones.vigentes(c.reloj.ahora()).map((s) => s.idUsuario),
    ).toEqual([ID_VENDEDOR]);
  });

  it('clave actual incorrecta → 422; nueva igual a la actual → 400; sin cambios', async () => {
    const c = contexto();
    await expect(
      c.cambiar.ejecutar({
        idUsuario: ID_CLIENTE,
        claveActual: 'Incorrecta2026',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ codigo: 'CLAVE_ACTUAL_INCORRECTA' });
    await expect(
      c.cambiar.ejecutar({
        idUsuario: ID_CLIENTE,
        claveActual: 'Catalogo2026',
        claveNueva: 'Catalogo2026',
      }),
    ).rejects.toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      message: 'La clave nueva debe ser distinta de la actual.',
    });
    expect(c.usuarios.usuarios[0].hashClave).toBe('hash:Catalogo2026');
    expect(c.auditoria.registradas).toHaveLength(0);
  });

  it('una cuenta inactiva → 401 NO_AUTENTICADO', async () => {
    const c = contexto();
    c.usuarios.usuarios[0] = desactivar(c.usuarios.usuarios[0]);
    await expect(
      c.cambiar.ejecutar({
        idUsuario: ID_CLIENTE,
        claveActual: 'Catalogo2026',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });
});

describe('D-35: restablecer la clave del Vendedor (comando)', () => {
  it('cambia la clave, revoca todas sus sesiones y registra CLAVE_RESTABLECIDA COMANDO_SERVIDOR', async () => {
    const c = contexto();
    await c.abrirSesion(ID_VENDEDOR, 1);
    await c.abrirSesion(ID_CLIENTE, 1);

    const resultado = await c.restablecer.ejecutar(CLAVE_NUEVA);

    expect(resultado).toEqual({ idUsuario: ID_VENDEDOR, sesionesRevocadas: 1 });
    expect(c.usuarios.usuarios[1].hashClave).toBe(`hash:${CLAVE_NUEVA}`);
    expect(c.auditoria.registradas.at(-1)).toMatchObject({
      enTransaccion: true,
      actividad: {
        accion: 'CLAVE_RESTABLECIDA',
        idUsuario: ID_VENDEDOR,
        detalle: { origen: 'COMANDO_SERVIDOR', sesionesRevocadas: 1 },
      },
    });
  });

  it('sin Vendedor falla con un error claro; con una clave débil, 400', async () => {
    const c = contexto();
    await expect(c.restablecer.ejecutar('debil')).rejects.toMatchObject({
      codigo: 'DATOS_INVALIDOS',
    });
    c.usuarios.usuarios.splice(1, 1);
    await expect(c.restablecer.ejecutar(CLAVE_NUEVA)).rejects.toThrow(
      'npm run crear-vendedor',
    );
  });
});

describe('RF-USU-05: listar clientes', () => {
  it('solo Clientes, con el vencimiento del código vigente', async () => {
    const c = contexto();
    const { venceEn } = await c.generar.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });
    const pagina = await c.listar.ejecutar(undefined, {
      pagina: 1,
      tamanio: 20,
    });

    expect(pagina.total).toBe(1);
    expect(pagina.elementos[0]).toMatchObject({
      id: ID_CLIENTE,
      activo: true,
      codigoRecuperacionVigenteHasta: venceEn,
    });
    c.reloj.avanzar(16 * MINUTO);
    const despues = await c.listar.ejecutar('PRUEBA', {
      pagina: 1,
      tamanio: 20,
    });
    expect(despues.elementos[0].codigoRecuperacionVigenteHasta).toBeNull();
  });
});
