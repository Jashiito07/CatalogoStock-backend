import {
  CorreoNoRegistradoError,
  CredencialesInvalidasError,
  CuentaDesactivadaError,
} from '../../dominio/errores-autenticacion.js';
import type { Canal } from '../../dominio/canal.js';
import {
  AuditoriaFalsa,
  CLAVE_VALIDA,
  CONFIGURACION,
  crearCliente,
  crearVendedor,
  desactivar,
  EmisorTokenAccesoFalso,
  GeneradorHashFalso,
  generadorIdSecuencial,
  GeneradorTokenFalso,
  INICIO,
  RelojFalso,
  SesionRepositorioEnMemoria,
  UN_DIA_MS,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import { IniciarSesionCasoUso } from './iniciar-sesion.caso-uso.js';

const CORREO_CLIENTE = 'cliente@ejemplo.test';
const CORREO_VENDEDOR = 'vendedor@ejemplo.test';

function preparar() {
  const usuarios = new UsuarioRepositorioEnMemoria();
  usuarios.usuarios.push(
    crearCliente('id-cliente', CORREO_CLIENTE),
    crearVendedor('id-vendedor', CORREO_VENDEDOR),
  );
  const sesiones = new SesionRepositorioEnMemoria();
  const hash = new GeneradorHashFalso();
  const emisor = new EmisorTokenAccesoFalso();
  const unidad = new UnidadDeTrabajoFalsa();
  const auditoria = new AuditoriaFalsa(unidad);
  const casoUso = new IniciarSesionCasoUso(
    usuarios,
    sesiones,
    hash,
    emisor,
    new GeneradorTokenFalso(),
    generadorIdSecuencial(),
    new RelojFalso(),
    CONFIGURACION,
    unidad,
    auditoria,
  );
  return { usuarios, sesiones, hash, emisor, auditoria, casoUso };
}

async function motivoDelFallo(promesa: Promise<unknown>): Promise<string> {
  const error = await promesa.then(
    () => {
      throw new Error('se esperaba un fallo');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CredencialesInvalidasError);
  expect(error).toMatchObject({
    codigo: 'CREDENCIALES_INVALIDAS',
    message: 'Correo o clave incorrectos.',
    categoria: 'NO_AUTENTICADO',
  });
  // El motivo nunca va en los detalles de la respuesta.
  expect((error as CredencialesInvalidasError).detalles).toBeUndefined();
  return (error as CredencialesInvalidasError).motivo;
}

async function errorDelFallo(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba un fallo');
    },
    (e: unknown) => e,
  );
}

describe('RF-USU-01 / CA-01 / D-19: IniciarSesionCasoUso', () => {
  it('CA-01: un Cliente con credenciales válidas en APP obtiene una sesión de su rol', async () => {
    const { sesiones, emisor, casoUso } = preparar();

    const resultado = await casoUso.ejecutar({
      canal: 'APP',
      correo: '  Cliente@Ejemplo.TEST ',
      clave: CLAVE_VALIDA,
    });

    expect(resultado.usuario).toMatchObject({
      id: 'id-cliente',
      rol: 'CLIENTE',
    });
    expect(resultado.tokenAcceso).toBe('acceso:id-cliente:CLIENTE');
    expect(resultado.venceAccesoEn).toEqual(
      new Date(INICIO.getTime() + 900_000),
    );
    expect(resultado.tokenRenovacion).toBe('token-1');
    expect(resultado.venceRenovacionEn).toEqual(
      new Date(INICIO.getTime() + 7 * UN_DIA_MS),
    );
    expect(emisor.emitidos).toEqual([
      { idUsuario: 'id-cliente', rol: 'CLIENTE' },
    ]);

    // D-09 / D-19: se guarda solo el hash del token y el canal.
    expect(sesiones.sesiones).toHaveLength(1);
    const [sesion] = sesiones.sesiones;
    expect(sesion.hashToken).toBe('h(token-1)');
    expect(sesion.hashToken).not.toBe(resultado.tokenRenovacion);
    expect(sesion.canal).toBe('APP');
    expect(sesion.idUsuario).toBe('id-cliente');
  });

  it('CA-01: el Vendedor en PANEL obtiene una sesión con rol VENDEDOR y canal PANEL', async () => {
    const { sesiones, casoUso } = preparar();

    const resultado = await casoUso.ejecutar({
      canal: 'PANEL',
      correo: CORREO_VENDEDOR,
      clave: CLAVE_VALIDA,
    });

    expect(resultado.usuario.rol).toBe('VENDEDOR');
    expect(sesiones.sesiones[0].canal).toBe('PANEL');
  });

  it('cada ingreso abre una familia de rotación distinta', async () => {
    const { sesiones, casoUso } = preparar();
    const datos = {
      canal: 'APP' as Canal,
      correo: CORREO_CLIENTE,
      clave: CLAVE_VALIDA,
    };

    await casoUso.ejecutar(datos);
    await casoUso.ejecutar(datos);

    expect(sesiones.sesiones[0].familia).not.toBe(sesiones.sesiones[1].familia);
  });

  it('CA-01: clave incorrecta → CREDENCIALES_INVALIDAS sin sesión', async () => {
    const { sesiones, casoUso } = preparar();

    const motivo = await motivoDelFallo(
      casoUso.ejecutar({
        canal: 'APP',
        correo: CORREO_CLIENTE,
        clave: 'Otra2026',
      }),
    );

    expect(motivo).toBe('CREDENCIALES_INVALIDAS');
    expect(sesiones.sesiones).toHaveLength(0);
  });

  it('D-52: correo inexistente en APP -> 401 CORREO_NO_REGISTRADO, compara contra un hash ficticio y no crea sesion', async () => {
    const { sesiones, hash, casoUso } = preparar();

    const error = await errorDelFallo(
      casoUso.ejecutar({
        canal: 'APP',
        correo: 'nadie@ejemplo.test',
        clave: CLAVE_VALIDA,
      }),
    );

    expect(error).toBeInstanceOf(CorreoNoRegistradoError);
    expect(error).toMatchObject({
      codigo: 'CORREO_NO_REGISTRADO',
      message: 'No existe una cuenta registrada con ese correo.',
      categoria: 'NO_AUTENTICADO',
    });
    expect(hash.comparaciones).toBe(1);
    expect(sesiones.sesiones).toHaveLength(0);
  });

  it('D-52: correo inexistente en PANEL -> el 401 generico (el panel no cambia), motivo CORREO_NO_REGISTRADO solo en la bitacora', async () => {
    const { auditoria, hash, casoUso } = preparar();

    const motivo = await motivoDelFallo(
      casoUso.ejecutar({
        canal: 'PANEL',
        correo: 'nadie@ejemplo.test',
        clave: CLAVE_VALIDA,
      }),
    );

    expect(motivo).toBe('CORREO_NO_REGISTRADO');
    expect(hash.comparaciones).toBe(1);
    expect(auditoria.registradas[0].actividad.detalle).toMatchObject({
      canal: 'PANEL',
      motivo: 'CORREO_NO_REGISTRADO',
    });
  });

  it('D-52: el tiempo no distingue los casos: una comparacion bcrypt tambien con cuenta existente, inactiva o de otro rol', async () => {
    const { usuarios, hash, casoUso } = preparar();
    usuarios.usuarios.push(
      desactivar(crearCliente('id-inactivo', 'inactivo@ejemplo.test')),
    );
    const intentos = [
      ['APP', CORREO_CLIENTE, 'Otra2026'],
      ['APP', CORREO_VENDEDOR, CLAVE_VALIDA],
      ['APP', 'inactivo@ejemplo.test', CLAVE_VALIDA],
      ['APP', 'nadie@ejemplo.test', CLAVE_VALIDA],
      ['PANEL', 'nadie@ejemplo.test', CLAVE_VALIDA],
    ] as const;

    for (const [canal, correo, clave] of intentos) {
      const antes = hash.comparaciones;
      await casoUso.ejecutar({ canal, correo, clave }).catch(() => undefined);
      expect(hash.comparaciones - antes).toBe(1);
    }
  });

  it('el hash ficticio se calcula una sola vez', async () => {
    const { hash, casoUso } = preparar();
    const datos = {
      canal: 'APP' as Canal,
      correo: 'nadie@ejemplo.test',
      clave: 'x',
    };

    await casoUso.ejecutar(datos).catch(() => undefined);
    await casoUso.ejecutar(datos).catch(() => undefined);

    expect(hash.generadas).toHaveLength(1);
    expect(hash.comparaciones).toBe(2);
  });

  it('un correo con formato invalido se trata como inexistente (CORREO_NO_REGISTRADO en APP)', async () => {
    const { casoUso } = preparar();

    await expect(
      errorDelFallo(
        casoUso.ejecutar({ canal: 'APP', correo: 'no es correo', clave: 'x' }),
      ),
    ).resolves.toBeInstanceOf(CorreoNoRegistradoError);
  });

  it('D-52: cuenta desactivada con clave correcta en APP -> 403 CUENTA_DESACTIVADA sin sesion', async () => {
    const { usuarios, sesiones, emisor, casoUso } = preparar();
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);

    const error = await errorDelFallo(
      casoUso.ejecutar({
        canal: 'APP',
        correo: CORREO_CLIENTE,
        clave: CLAVE_VALIDA,
      }),
    );

    expect(error).toBeInstanceOf(CuentaDesactivadaError);
    expect(error).toMatchObject({
      codigo: 'CUENTA_DESACTIVADA',
      message: 'Tu cuenta está desactivada. Contacta a tu vendedor.',
      categoria: 'NO_AUTORIZADO',
    });
    expect(sesiones.sesiones).toHaveLength(0);
    expect(emisor.emitidos).toHaveLength(0);
  });

  it('D-52: cuenta desactivada con clave incorrecta en APP -> 401 generico (no revela el estado sin la clave)', async () => {
    const { usuarios, auditoria, casoUso } = preparar();
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);

    await expect(
      motivoDelFallo(
        casoUso.ejecutar({
          canal: 'APP',
          correo: CORREO_CLIENTE,
          clave: 'Otra2026',
        }),
      ),
    ).resolves.toBe('CREDENCIALES_INVALIDAS');
    expect(auditoria.registradas[0].actividad.detalle).toMatchObject({
      motivo: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('D-52: SESION_FALLIDA con motivo CUENTA_DESACTIVADA, el correo intentado y el id de la cuenta', async () => {
    const { usuarios, auditoria, casoUso } = preparar();
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);

    await errorDelFallo(
      casoUso.ejecutar({
        canal: 'APP',
        correo: CORREO_CLIENTE,
        clave: CLAVE_VALIDA,
      }),
    );

    expect(auditoria.registradas).toHaveLength(1);
    expect(auditoria.registradas[0]).toMatchObject({
      sinInterrumpir: true,
      enTransaccion: false,
      actividad: {
        accion: 'SESION_FALLIDA',
        idUsuario: 'id-cliente',
        detalle: {
          correo: CORREO_CLIENTE,
          canal: 'APP',
          motivo: 'CUENTA_DESACTIVADA',
        },
      },
    });
  });

  it('D-52: un Cliente (activo o no) en PANEL sigue con el 401 generico y motivo ROL_NO_PERMITIDO (el panel no cambia)', async () => {
    const { usuarios, casoUso } = preparar();
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);

    await expect(
      motivoDelFallo(
        casoUso.ejecutar({
          canal: 'PANEL',
          correo: CORREO_CLIENTE,
          clave: CLAVE_VALIDA,
        }),
      ),
    ).resolves.toBe('ROL_NO_PERMITIDO');
  });

  it('D-22: una clave de más de 72 bytes nunca es válida (bcrypt ignoraría el resto)', async () => {
    const { usuarios, casoUso } = preparar();
    const larga = `${'a1'.repeat(36)}extra`;
    // El hash falso coincidiría, como haría bcrypt con los primeros 72 bytes.
    usuarios.usuarios[0] = crearCliente(
      'id-largo',
      'largo@ejemplo.test',
      larga,
    );

    await expect(
      motivoDelFallo(
        casoUso.ejecutar({
          canal: 'APP',
          correo: 'largo@ejemplo.test',
          clave: larga,
        }),
      ),
    ).resolves.toBe('CREDENCIALES_INVALIDAS');
  });

  it('D-19: un Vendedor en APP → mismo 401, motivo ROL_NO_PERMITIDO y ninguna sesión', async () => {
    const { sesiones, emisor, casoUso } = preparar();

    const motivo = await motivoDelFallo(
      casoUso.ejecutar({
        canal: 'APP',
        correo: CORREO_VENDEDOR,
        clave: CLAVE_VALIDA,
      }),
    );

    expect(motivo).toBe('ROL_NO_PERMITIDO');
    expect(sesiones.sesiones).toHaveLength(0);
    expect(emisor.emitidos).toHaveLength(0);
  });

  it('D-19: un Cliente en PANEL → mismo 401, motivo ROL_NO_PERMITIDO y ninguna sesión', async () => {
    const { sesiones, casoUso } = preparar();

    const motivo = await motivoDelFallo(
      casoUso.ejecutar({
        canal: 'PANEL',
        correo: CORREO_CLIENTE,
        clave: CLAVE_VALIDA,
      }),
    );

    expect(motivo).toBe('ROL_NO_PERMITIDO');
    expect(sesiones.sesiones).toHaveLength(0);
  });

  describe('RF-USU-04 / D-20: bitácora de los ingresos', () => {
    it('un ingreso correcto deja SESION_INICIADA con { rol, canal } y el id de la sesión, en la misma transacción', async () => {
      const { sesiones, auditoria, casoUso } = preparar();

      await casoUso.ejecutar({
        canal: 'APP',
        correo: CORREO_CLIENTE,
        clave: CLAVE_VALIDA,
      });

      expect(auditoria.registradas).toEqual([
        {
          actividad: {
            accion: 'SESION_INICIADA',
            idUsuario: 'id-cliente',
            entidad: 'SESION',
            idEntidad: sesiones.sesiones[0].id,
            detalle: { rol: 'CLIENTE', canal: 'APP' },
          },
          enTransaccion: true,
          sinInterrumpir: false,
        },
      ]);
    });

    it('si la bitácora falla en un ingreso correcto, el ingreso falla (la transacción deshace la sesión)', async () => {
      const { auditoria, emisor, casoUso } = preparar();
      const fallo = new Error('bitácora no disponible');
      auditoria.fallo = fallo;

      await expect(
        casoUso.ejecutar({
          canal: 'APP',
          correo: CORREO_CLIENTE,
          clave: CLAVE_VALIDA,
        }),
      ).rejects.toBe(fallo);
      expect(emisor.emitidos).toHaveLength(0);
    });

    it('D-20: clave incorrecta → SESION_FALLIDA con el correo intentado, el canal, el motivo y el id del usuario; nunca la clave; fuera de transacción', async () => {
      const { auditoria, casoUso } = preparar();

      await motivoDelFallo(
        casoUso.ejecutar({
          canal: 'PANEL',
          correo: ' Cliente@Ejemplo.TEST',
          clave: 'ClaveIntentada99',
        }),
      );

      expect(auditoria.registradas).toEqual([
        {
          actividad: {
            accion: 'SESION_FALLIDA',
            idUsuario: 'id-cliente',
            entidad: 'SESION',
            idEntidad: null,
            // La bitácora lo normaliza a minúsculas al guardarlo.
            detalle: {
              correo: ' Cliente@Ejemplo.TEST',
              canal: 'PANEL',
              motivo: 'CREDENCIALES_INVALIDAS',
            },
          },
          enTransaccion: false,
          sinInterrumpir: true,
        },
      ]);
      expect(JSON.stringify(auditoria.registradas)).not.toContain(
        'ClaveIntentada99',
      );
    });

    it('D-20 / D-52: correo inexistente -> SESION_FALLIDA con motivo CORREO_NO_REGISTRADO y sin usuario (idUsuario null); el correo intentado se conserva', async () => {
      const { auditoria, casoUso } = preparar();

      await errorDelFallo(
        casoUso.ejecutar({
          canal: 'APP',
          correo: 'nadie@ejemplo.test',
          clave: CLAVE_VALIDA,
        }),
      );

      expect(auditoria.registradas[0].actividad).toMatchObject({
        accion: 'SESION_FALLIDA',
        idUsuario: null,
        detalle: {
          correo: 'nadie@ejemplo.test',
          motivo: 'CORREO_NO_REGISTRADO',
        },
      });
    });

    it('D-19 / D-20: Vendedor en APP → SESION_FALLIDA con motivo ROL_NO_PERMITIDO y su id', async () => {
      const { auditoria, casoUso } = preparar();

      await motivoDelFallo(
        casoUso.ejecutar({
          canal: 'APP',
          correo: CORREO_VENDEDOR,
          clave: CLAVE_VALIDA,
        }),
      );

      expect(auditoria.registradas).toHaveLength(1);
      expect(auditoria.registradas[0].actividad).toMatchObject({
        accion: 'SESION_FALLIDA',
        idUsuario: 'id-vendedor',
        detalle: { canal: 'APP', motivo: 'ROL_NO_PERMITIDO' },
      });
      expect(JSON.stringify(auditoria.registradas)).not.toContain(CLAVE_VALIDA);
    });

    it('si la bitácora no está disponible, un ingreso fallido responde el mismo 401', async () => {
      const { auditoria, casoUso } = preparar();
      auditoria.fallo = new Error('bitácora no disponible');

      await expect(
        motivoDelFallo(
          casoUso.ejecutar({
            canal: 'APP',
            correo: CORREO_CLIENTE,
            clave: 'Otra2026',
          }),
        ),
      ).resolves.toBe('CREDENCIALES_INVALIDAS');
    });
  });

  it('D-19: con rol equivocado y clave incorrecta, el motivo es la clave (primero se verifica la clave)', async () => {
    const { casoUso } = preparar();

    await expect(
      motivoDelFallo(
        casoUso.ejecutar({
          canal: 'PANEL',
          correo: CORREO_CLIENTE,
          clave: 'Mala2026',
        }),
      ),
    ).resolves.toBe('CREDENCIALES_INVALIDAS');
  });
});
