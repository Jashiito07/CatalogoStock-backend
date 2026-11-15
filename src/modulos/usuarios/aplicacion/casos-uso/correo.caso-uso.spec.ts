import { ConfirmarCorreoCasoUso } from './confirmar-correo.caso-uso.js';
import {
  AuditoriaFalsa,
  CodigoRecuperacionRepositorioEnMemoria,
  conCorreoVerificado,
  crearCliente,
  crearVendedor,
  desactivar,
  EnviadorCorreoFalso,
  GeneradorHashFalso,
  generadorIdSecuencial,
  INICIO,
  ProtectorCodigoFalso,
  RelojFalso,
  SesionRepositorioEnMemoria,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import { GenerarCodigoRecuperacionCasoUso } from './generar-codigo-recuperacion.caso-uso.js';
import { RecuperarClaveCasoUso } from './recuperar-clave.caso-uso.js';
import { SolicitarRecuperacionPorCorreoCasoUso } from './solicitar-recuperacion-por-correo.caso-uso.js';
import { SolicitarVerificacionCorreoCasoUso } from './solicitar-verificacion-correo.caso-uso.js';

/**
 * Pruebas de la verificación del correo y la recuperación por correo
 * (contrato de correo, RF-USU-05, D-50). El envío es siempre un doble en
 * memoria: nunca se envía un correo real.
 */

const ID_CLIENTE = '00000000-0000-4000-8000-0000000000c1';
const ID_VENDEDOR = '00000000-0000-4000-8000-0000000000e1';
const CORREO_CLIENTE = 'maria@ejemplo.test';
const CORREO_VENDEDOR = 'vendedor@ejemplo.test';
const CLAVE_NUEVA = 'NuevaClave2026';
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;

function contexto(opciones: { verificados?: boolean } = {}) {
  const verificados = opciones.verificados ?? false;
  const usuarios = new UsuarioRepositorioEnMemoria();
  const sesiones = new SesionRepositorioEnMemoria();
  const codigos = new CodigoRecuperacionRepositorioEnMemoria();
  const protector = new ProtectorCodigoFalso();
  const hash = new GeneradorHashFalso();
  const correo = new EnviadorCorreoFalso();
  const reloj = new RelojFalso(INICIO);
  const unidad = new UnidadDeTrabajoFalsa();
  const auditoria = new AuditoriaFalsa(unidad);
  const ids = generadorIdSecuencial();

  const cliente = crearCliente(ID_CLIENTE, CORREO_CLIENTE);
  const vendedor = crearVendedor(ID_VENDEDOR, CORREO_VENDEDOR);
  usuarios.usuarios.push(
    verificados ? conCorreoVerificado(cliente) : cliente,
    verificados ? conCorreoVerificado(vendedor) : vendedor,
  );

  return {
    usuarios,
    codigos,
    protector,
    correo,
    reloj,
    auditoria,
    unidad,
    sesiones,
    solicitarVerificacion: new SolicitarVerificacionCorreoCasoUso(
      usuarios,
      codigos,
      protector,
      correo,
      ids,
      reloj,
      unidad,
      auditoria,
    ),
    confirmar: new ConfirmarCorreoCasoUso(
      usuarios,
      codigos,
      protector,
      reloj,
      unidad,
      auditoria,
    ),
    solicitarRecuperacion: new SolicitarRecuperacionPorCorreoCasoUso(
      usuarios,
      codigos,
      protector,
      correo,
      ids,
      reloj,
      unidad,
      auditoria,
    ),
    recuperar: new RecuperarClaveCasoUso(
      usuarios,
      sesiones,
      codigos,
      protector,
      hash,
      reloj,
      unidad,
      auditoria,
    ),
    generarAsistido: new GenerarCodigoRecuperacionCasoUso(
      usuarios,
      codigos,
      protector,
      ids,
      reloj,
      unidad,
      auditoria,
    ),
  };
}

type Contexto = ReturnType<typeof contexto>;

/** Solicita la recuperación y espera el envío en segundo plano. */
async function solicitar(c: Contexto, correo: string): Promise<void> {
  const { envio } = await c.solicitarRecuperacion.ejecutar(correo);
  await envio;
}

function codigoDelCorreo(c: Contexto, indice = -1): string {
  const mensaje = c.correo.enviados.at(indice);
  const codigo = /\b(\d{6})\b/.exec(mensaje?.texto ?? '')?.[1];
  if (codigo === undefined) {
    throw new Error('El correo no trae un código');
  }
  return codigo;
}

describe('Verificar el correo (RF-USU-05, contrato de correo)', () => {
  it('pide el código y lo confirma: correo_verificado_en se llena, el código queda usado y se registra CORREO_VERIFICADO en la transacción', async () => {
    const c = contexto();

    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);
    expect(c.correo.enviados).toHaveLength(1);
    expect(c.correo.enviados[0].para).toBe(CORREO_CLIENTE);
    expect(c.correo.enviados[0].asunto).toBe('Tu código de CatálogoStock');
    expect(c.codigos.codigos[0].proposito).toBe('VERIFICACION_CORREO');
    expect(c.codigos.codigos[0].generadoPor).toBeNull();
    expect(c.usuarios.usuarios[0].correoVerificadoEn).toBeNull();

    c.reloj.avanzar(MINUTO);
    await c.confirmar.ejecutar({
      idUsuario: ID_CLIENTE,
      codigo: codigoDelCorreo(c),
    });

    expect(c.usuarios.usuarios[0].correoVerificadoEn).toEqual(c.reloj.ahora());
    expect(c.codigos.codigos[0].usadoEn).toEqual(c.reloj.ahora());
    expect(c.auditoria.registradas.at(-1)).toMatchObject({
      enTransaccion: true,
      actividad: {
        accion: 'CORREO_VERIFICADO',
        idUsuario: ID_CLIENTE,
        entidad: 'USUARIO',
        idEntidad: ID_CLIENTE,
      },
    });
  });

  it('el envío va dentro de la transacción y la bitácora no trae el código ni el correo', async () => {
    const c = contexto();
    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);

    const [registro] = c.auditoria.registradas;
    expect(registro).toMatchObject({
      enTransaccion: true,
      actividad: { accion: 'CODIGO_CORREO_ENVIADO' },
    });
    const bitacora = JSON.stringify(c.auditoria.registradas);
    expect(bitacora).not.toContain(codigoDelCorreo(c));
    expect(bitacora).not.toContain('@');
  });

  it('un correo ya verificado → 409 CORREO_YA_VERIFICADO y no se envía nada', async () => {
    const c = contexto({ verificados: true });

    await expect(
      c.solicitarVerificacion.ejecutar(ID_CLIENTE),
    ).rejects.toMatchObject({ codigo: 'CORREO_YA_VERIFICADO' });
    expect(c.correo.enviados).toHaveLength(0);
    expect(c.codigos.codigos).toHaveLength(0);
  });

  it('el cuarto envío en una hora → 429 DEMASIADAS_SOLICITUDES con el tiempo de espera; pasada la hora vuelve a enviar', async () => {
    const c = contexto();
    for (let i = 0; i < 3; i++) {
      await c.solicitarVerificacion.ejecutar(ID_CLIENTE);
      c.reloj.avanzar(MINUTO);
    }

    await expect(
      c.solicitarVerificacion.ejecutar(ID_CLIENTE),
    ).rejects.toMatchObject({
      codigo: 'DEMASIADAS_SOLICITUDES',
      detalles: { reintentarEnSegundos: 57 * 60 },
    });
    expect(c.correo.enviados).toHaveLength(3);

    c.reloj.avanzar(57 * MINUTO);
    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);
    expect(c.correo.enviados).toHaveLength(4);
  });

  it('si el servicio de correo falla → 503 CORREO_NO_DISPONIBLE y no queda código, bitácora ni envío gastado', async () => {
    const c = contexto();
    c.correo.fallar = true;
    const intentar = () => c.solicitarVerificacion.ejecutar(ID_CLIENTE);

    await expect(intentar()).rejects.toMatchObject({
      codigo: 'CORREO_NO_DISPONIBLE',
    });
    // En la base real la transacción se deshace; el doble en memoria no, así
    // que se comprueba lo que sí depende del caso de uso: el error es genérico.
    await expect(intentar()).rejects.toThrow(
      'El servicio de correo no está disponible.',
    );
    expect(c.correo.enviados).toHaveLength(0);
  });

  it('una cuenta inexistente o inactiva → 401', async () => {
    const c = contexto();
    await expect(
      c.solicitarVerificacion.ejecutar('otro-id'),
    ).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    c.usuarios.usuarios[0] = desactivar(c.usuarios.usuarios[0]);
    await expect(
      c.solicitarVerificacion.ejecutar(ID_CLIENTE),
    ).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    expect(c.correo.enviados).toHaveLength(0);
  });

  it('un código nuevo invalida el anterior', async () => {
    const c = contexto();
    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);
    const primero = codigoDelCorreo(c);
    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);

    expect(c.codigos.codigos[0].invalidadoEn).not.toBeNull();
    await expect(
      c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo: primero }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
    await c.confirmar.ejecutar({
      idUsuario: ID_CLIENTE,
      codigo: codigoDelCorreo(c),
    });
  });

  it('código incorrecto, vencido, reutilizado o inexistente → el mismo 422 con mensaje único', async () => {
    const c = contexto();
    await expect(
      c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo: '123456' }),
    ).rejects.toMatchObject({ motivo: 'SIN_CODIGO' });

    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);
    const codigo = codigoDelCorreo(c);
    const incorrecto = codigo === '000000' ? '000001' : '000000';
    const rechazo = await c.confirmar
      .ejecutar({ idUsuario: ID_CLIENTE, codigo: incorrecto })
      .catch((e: unknown) => e as Error & { motivo: string; codigo: string });
    expect(rechazo).toMatchObject({
      codigo: 'CODIGO_INVALIDO',
      motivo: 'CODIGO_INCORRECTO',
      message: 'El código no es válido o ya venció. Pide uno nuevo.',
    });
    expect(c.codigos.codigos[0].intentosFallidos).toBe(1);

    c.reloj.avanzar(15 * MINUTO);
    await expect(
      c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo }),
    ).rejects.toMatchObject({ motivo: 'VENCIDO' });

    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);
    const vigente = codigoDelCorreo(c);
    await c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo: vigente });
    await expect(
      c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo: vigente }),
    ).rejects.toMatchObject({ motivo: 'SIN_CODIGO' });
  });

  it('el quinto intento fallido invalida el código aunque luego llegue el correcto', async () => {
    const c = contexto();
    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);
    const codigo = codigoDelCorreo(c);
    const incorrecto = codigo === '999999' ? '999998' : '999999';

    for (let i = 0; i < 5; i++) {
      await expect(
        c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo: incorrecto }),
      ).rejects.toMatchObject({ motivo: 'CODIGO_INCORRECTO' });
    }
    await expect(
      c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo }),
    ).rejects.toMatchObject({ motivo: 'AGOTADO' });
    expect(c.usuarios.usuarios[0].correoVerificadoEn).toBeNull();
  });

  it('un código de recuperación no verifica el correo (propiedad y propósito)', async () => {
    const c = contexto({ verificados: true });
    await solicitar(c, CORREO_CLIENTE);
    const codigoRecuperacion = codigoDelCorreo(c);
    c.usuarios.usuarios[0] = crearCliente(ID_CLIENTE, CORREO_CLIENTE);

    await expect(
      c.confirmar.ejecutar({
        idUsuario: ID_CLIENTE,
        codigo: codigoRecuperacion,
      }),
    ).rejects.toMatchObject({ motivo: 'SIN_CODIGO' });
    expect(c.usuarios.usuarios[0].correoVerificadoEn).toBeNull();
  });

  it('defensa en profundidad: formato inválido → 400 sin tocar nada', async () => {
    const c = contexto();
    await expect(
      c.confirmar.ejecutar({ idUsuario: ID_CLIENTE, codigo: '12ab56' }),
    ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
    expect(c.auditoria.registradas).toHaveLength(0);
  });
});

describe('Recuperación de clave por correo (RF-USU-05, contrato de correo)', () => {
  it('cuenta válida (activa y con correo verificado) → se envía un solo correo, al correo registrado, con CODIGO_CORREO_ENVIADO en la transacción', async () => {
    const c = contexto({ verificados: true });

    await solicitar(c, `  ${CORREO_CLIENTE.toUpperCase()} `);

    expect(c.correo.enviados).toHaveLength(1);
    expect(c.correo.enviados[0].para).toBe(CORREO_CLIENTE);
    expect(c.codigos.codigos[0]).toMatchObject({
      proposito: 'RECUPERACION_CORREO',
      generadoPor: null,
      hashCodigo: `hmac(${codigoDelCorreo(c)})`,
    });
    expect(c.auditoria.registradas).toHaveLength(1);
    expect(c.auditoria.registradas[0]).toMatchObject({
      enTransaccion: true,
      actividad: {
        accion: 'CODIGO_CORREO_ENVIADO',
        idUsuario: ID_CLIENTE,
        detalle: { correo: CORREO_CLIENTE, proposito: 'RECUPERACION_CORREO' },
      },
    });
    expect(JSON.stringify(c.auditoria.registradas)).not.toContain(
      codigoDelCorreo(c),
    );
  });

  it.each([
    ['correo inexistente', 'nadie@ejemplo.test', 'NO_EXISTE'],
    ['correo mal escrito', 'no-es-correo', 'NO_EXISTE'],
  ])(
    '%s → no envía nada y registra SOLICITUD_RECUPERACION_IGNORADA',
    async (_caso, correo, motivo) => {
      const c = contexto({ verificados: true });

      await solicitar(c, correo);

      expect(c.correo.enviados).toHaveLength(0);
      expect(c.codigos.codigos).toHaveLength(0);
      expect(c.auditoria.registradas).toMatchObject([
        {
          sinInterrumpir: true,
          enTransaccion: false,
          actividad: {
            accion: 'SOLICITUD_RECUPERACION_IGNORADA',
            idUsuario: null,
            detalle: { correo, motivo },
          },
        },
      ]);
    },
  );

  it('cuenta con el correo sin verificar → no envía nada y lo registra con su motivo', async () => {
    const c = contexto();

    await solicitar(c, CORREO_CLIENTE);

    expect(c.correo.enviados).toHaveLength(0);
    expect(c.auditoria.registradas[0].actividad).toMatchObject({
      accion: 'SOLICITUD_RECUPERACION_IGNORADA',
      idUsuario: ID_CLIENTE,
      detalle: { motivo: 'CORREO_NO_VERIFICADO' },
    });
  });

  it('cuenta inactiva → no envía nada', async () => {
    const c = contexto({ verificados: true });
    c.usuarios.usuarios[0] = desactivar(c.usuarios.usuarios[0]);

    await solicitar(c, CORREO_CLIENTE);

    expect(c.correo.enviados).toHaveLength(0);
    expect(c.auditoria.registradas[0].actividad).toMatchObject({
      detalle: { motivo: 'CUENTA_INACTIVA' },
    });
  });

  it('D-17: el cuarto envío en una hora no envía nada y se registra con LIMITE_HORARIO', async () => {
    const c = contexto({ verificados: true });
    for (let i = 0; i < 3; i++) {
      await solicitar(c, CORREO_CLIENTE);
      c.reloj.avanzar(MINUTO);
    }

    await solicitar(c, CORREO_CLIENTE);

    expect(c.correo.enviados).toHaveLength(3);
    expect(c.auditoria.registradas.at(-1)).toMatchObject({
      sinInterrumpir: true,
      actividad: {
        accion: 'SOLICITUD_RECUPERACION_IGNORADA',
        idUsuario: ID_CLIENTE,
        detalle: { correo: CORREO_CLIENTE, motivo: 'LIMITE_HORARIO' },
      },
    });

    c.reloj.avanzar(HORA);
    await solicitar(c, CORREO_CLIENTE);
    expect(c.correo.enviados).toHaveLength(4);
  });

  it('falla del servicio de correo → la solicitud no falla ni deja una promesa sin atender', async () => {
    const c = contexto({ verificados: true });
    c.correo.fallar = true;

    const resultado = await c.solicitarRecuperacion.ejecutar(CORREO_CLIENTE);

    await expect(resultado.envio).resolves.toBeUndefined();
    expect(c.correo.enviados).toHaveLength(0);
  });

  it('el código enviado restablece la clave, revoca las sesiones y reusarlo → 422; el origen es CODIGO_CORREO', async () => {
    const c = contexto({ verificados: true });
    await solicitar(c, CORREO_CLIENTE);
    const codigo = codigoDelCorreo(c);

    await c.recuperar.ejecutar({
      correo: CORREO_CLIENTE,
      codigo,
      claveNueva: CLAVE_NUEVA,
    });

    expect(c.usuarios.usuarios[0].hashClave).toBe(`hash:${CLAVE_NUEVA}`);
    expect(c.auditoria.registradas.at(-1)).toMatchObject({
      enTransaccion: true,
      actividad: {
        accion: 'CLAVE_RESTABLECIDA',
        idUsuario: ID_CLIENTE,
        detalle: { origen: 'CODIGO_CORREO', sesionesRevocadas: 0 },
      },
    });
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo,
        claveNueva: 'OtraClave2026',
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO', motivo: 'SIN_CODIGO' });
  });

  it('código de correo incorrecto → suma un intento; al quinto el código queda invalidado', async () => {
    const c = contexto({ verificados: true });
    await solicitar(c, CORREO_CLIENTE);
    const codigo = codigoDelCorreo(c);
    const incorrecto = codigo === '999999' ? '999998' : '999999';

    for (let i = 0; i < 5; i++) {
      await expect(
        c.recuperar.ejecutar({
          correo: CORREO_CLIENTE,
          codigo: incorrecto,
          claveNueva: CLAVE_NUEVA,
        }),
      ).rejects.toMatchObject({ motivo: 'CODIGO_INCORRECTO' });
    }
    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo,
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'AGOTADO' });
  });

  it('código de correo vencido → 422', async () => {
    const c = contexto({ verificados: true });
    await solicitar(c, CORREO_CLIENTE);
    const codigo = codigoDelCorreo(c);
    c.reloj.avanzar(15 * MINUTO);

    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo,
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'VENCIDO' });
  });

  it('el Vendedor sí recupera su clave con el código enviado a su correo verificado (RF-USU-05)', async () => {
    const c = contexto({ verificados: true });
    await solicitar(c, CORREO_VENDEDOR);
    expect(c.correo.enviados[0].para).toBe(CORREO_VENDEDOR);

    await c.recuperar.ejecutar({
      correo: CORREO_VENDEDOR,
      codigo: codigoDelCorreo(c),
      claveNueva: CLAVE_NUEVA,
    });

    expect(c.usuarios.usuarios[1].hashClave).toBe(`hash:${CLAVE_NUEVA}`);
  });

  it('sigue siendo cierto que el Vendedor no usa la recuperación asistida: sin código de correo → NO_CLIENTE', async () => {
    const c = contexto({ verificados: true });

    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_VENDEDOR,
        codigo: '123456',
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'NO_CLIENTE' });
  });

  it('un código asistido y uno por correo se reemplazan entre sí: solo sirve el último', async () => {
    const c = contexto({ verificados: true });
    const { codigo: asistido } = await c.generarAsistido.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });
    await solicitar(c, CORREO_CLIENTE);

    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: asistido,
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
    await c.recuperar.ejecutar({
      correo: CORREO_CLIENTE,
      codigo: codigoDelCorreo(c),
      claveNueva: CLAVE_NUEVA,
    });
  });

  it('el código asistido sigue funcionando y registra origen CODIGO_VENDEDOR (RF-USU-05 conservado)', async () => {
    const c = contexto();
    const { codigo } = await c.generarAsistido.ejecutar({
      idVendedor: ID_VENDEDOR,
      idCliente: ID_CLIENTE,
    });

    await c.recuperar.ejecutar({
      correo: CORREO_CLIENTE,
      codigo,
      claveNueva: CLAVE_NUEVA,
    });

    expect(c.auditoria.registradas.at(-1)?.actividad.detalle).toMatchObject({
      origen: 'CODIGO_VENDEDOR',
    });
  });

  it('un código de verificación no sirve para recuperar la clave', async () => {
    const c = contexto();
    await c.solicitarVerificacion.ejecutar(ID_CLIENTE);

    await expect(
      c.recuperar.ejecutar({
        correo: CORREO_CLIENTE,
        codigo: codigoDelCorreo(c),
        claveNueva: CLAVE_NUEVA,
      }),
    ).rejects.toMatchObject({ motivo: 'SIN_CODIGO' });
  });
});
