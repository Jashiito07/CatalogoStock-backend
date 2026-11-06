import { CredencialesInvalidasError } from '../../dominio/errores-autenticacion.js';
import type { Canal } from '../../dominio/canal.js';
import {
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
  const casoUso = new IniciarSesionCasoUso(
    usuarios,
    sesiones,
    hash,
    emisor,
    new GeneradorTokenFalso(),
    generadorIdSecuencial(),
    new RelojFalso(),
    CONFIGURACION,
  );
  return { usuarios, sesiones, hash, emisor, casoUso };
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

  it('CA-01: correo inexistente → mismo error y también compara contra un hash ficticio', async () => {
    const { sesiones, hash, casoUso } = preparar();

    const motivo = await motivoDelFallo(
      casoUso.ejecutar({
        canal: 'APP',
        correo: 'nadie@ejemplo.test',
        clave: CLAVE_VALIDA,
      }),
    );

    expect(motivo).toBe('CREDENCIALES_INVALIDAS');
    expect(hash.comparaciones).toBe(1);
    expect(sesiones.sesiones).toHaveLength(0);
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

  it('un correo con formato inválido responde lo mismo que uno inexistente', async () => {
    const { casoUso } = preparar();

    await expect(
      motivoDelFallo(
        casoUso.ejecutar({ canal: 'APP', correo: 'no es correo', clave: 'x' }),
      ),
    ).resolves.toBe('CREDENCIALES_INVALIDAS');
  });

  it('una cuenta inactiva no inicia sesión aunque la clave sea correcta', async () => {
    const { usuarios, sesiones, casoUso } = preparar();
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);

    await expect(
      motivoDelFallo(
        casoUso.ejecutar({
          canal: 'APP',
          correo: CORREO_CLIENTE,
          clave: CLAVE_VALIDA,
        }),
      ),
    ).resolves.toBe('CREDENCIALES_INVALIDAS');
    expect(sesiones.sesiones).toHaveLength(0);
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
