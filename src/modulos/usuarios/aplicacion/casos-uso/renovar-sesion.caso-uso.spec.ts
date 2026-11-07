import { TokenRenovacionInvalidoError } from '../../dominio/errores-autenticacion.js';
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
  RelojFalso,
  SesionRepositorioEnMemoria,
  UN_DIA_MS,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import { IniciarSesionCasoUso } from './iniciar-sesion.caso-uso.js';
import { RenovarSesionCasoUso } from './renovar-sesion.caso-uso.js';

function preparar() {
  const usuarios = new UsuarioRepositorioEnMemoria();
  usuarios.usuarios.push(
    crearCliente('id-cliente', 'cliente@ejemplo.test'),
    crearVendedor('id-vendedor', 'vendedor@ejemplo.test'),
  );
  const sesiones = new SesionRepositorioEnMemoria();
  const reloj = new RelojFalso();
  const tokens = new GeneradorTokenFalso();
  const ids = generadorIdSecuencial();
  const emisor = new EmisorTokenAccesoFalso();
  const unidad = new UnidadDeTrabajoFalsa();
  const auditoria = new AuditoriaFalsa(unidad);
  const iniciar = new IniciarSesionCasoUso(
    usuarios,
    sesiones,
    new GeneradorHashFalso(),
    emisor,
    tokens,
    ids,
    reloj,
    CONFIGURACION,
    unidad,
    auditoria,
  );
  const renovar = new RenovarSesionCasoUso(
    usuarios,
    sesiones,
    emisor,
    tokens,
    ids,
    reloj,
    CONFIGURACION,
    auditoria,
  );
  const ingresar = async (canal: Canal = 'APP') =>
    iniciar.ejecutar({
      canal,
      correo:
        canal === 'APP' ? 'cliente@ejemplo.test' : 'vendedor@ejemplo.test',
      clave: CLAVE_VALIDA,
    });
  return { usuarios, sesiones, reloj, renovar, ingresar, auditoria };
}

async function codigoDelFallo(promesa: Promise<unknown>): Promise<string> {
  const error = await promesa.then(
    () => {
      throw new Error('se esperaba un fallo');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TokenRenovacionInvalidoError);
  return (error as TokenRenovacionInvalidoError).codigo;
}

describe('RF-USU-01 / D-09: RenovarSesionCasoUso (rotación)', () => {
  it('entrega un par nuevo, revoca el token usado y conserva usuario, canal y familia', async () => {
    const { sesiones, reloj, renovar, ingresar } = preparar();
    const inicial = await ingresar('PANEL');
    reloj.avanzar(UN_DIA_MS);

    const renovada = await renovar.ejecutar(inicial.tokenRenovacion);

    expect(renovada.tokenRenovacion).not.toBe(inicial.tokenRenovacion);
    expect(renovada.usuario.rol).toBe('VENDEDOR');
    expect(renovada.tokenAcceso).toBe('acceso:id-vendedor:VENDEDOR');
    expect(renovada.venceRenovacionEn).toEqual(
      new Date(reloj.ahora().getTime() + 7 * UN_DIA_MS),
    );
    const [anterior, nueva] = sesiones.sesiones;
    expect(anterior.motivoRevocacion).toBe('ROTADA');
    expect(nueva.estadoEn(reloj.ahora())).toBe('VIGENTE');
    expect(nueva.canal).toBe('PANEL');
    expect(nueva.familia).toBe(anterior.familia);
  });

  it('el token nuevo también se puede renovar (cadena de rotación)', async () => {
    const { renovar, ingresar } = preparar();
    const inicial = await ingresar();

    const segunda = await renovar.ejecutar(inicial.tokenRenovacion);
    const tercera = await renovar.ejecutar(segunda.tokenRenovacion);

    expect(tercera.tokenRenovacion).not.toBe(segunda.tokenRenovacion);
  });

  it('D-09: un token usado dos veces es rechazado y se revoca toda la familia', async () => {
    const { sesiones, reloj, renovar, ingresar } = preparar();
    const inicial = await ingresar();
    const renovada = await renovar.ejecutar(inicial.tokenRenovacion);

    await expect(
      codigoDelFallo(renovar.ejecutar(inicial.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');

    // El token legítimo más reciente también queda revocado.
    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(0);
    expect(sesiones.sesiones[1].motivoRevocacion).toBe('REUTILIZACION');
    await expect(
      codigoDelFallo(renovar.ejecutar(renovada.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');
  });

  it('RF-USU-04: la reutilización deja SESION_REUTILIZACION_DETECTADA sin interrumpir, fuera de transacción y una sola vez', async () => {
    const { sesiones, renovar, ingresar, auditoria } = preparar();
    const inicial = await ingresar();
    await renovar.ejecutar(inicial.tokenRenovacion);

    await renovar.ejecutar(inicial.tokenRenovacion).catch(() => undefined);
    // Repetir con la familia ya revocada no cambia nada ni registra otra vez.
    await renovar.ejecutar(inicial.tokenRenovacion).catch(() => undefined);

    expect(auditoria.acciones()).toEqual([
      'SESION_INICIADA',
      'SESION_REUTILIZACION_DETECTADA',
    ]);
    expect(auditoria.registradas[1]).toEqual({
      actividad: {
        accion: 'SESION_REUTILIZACION_DETECTADA',
        idUsuario: 'id-cliente',
        entidad: 'SESION',
        idEntidad: sesiones.sesiones[0].id,
        detalle: { familiaRevocada: true },
      },
      enTransaccion: false,
      sinInterrumpir: true,
    });
  });

  it('decisión 1.5: con la bitácora fallando, la reutilización responde TOKEN_INVALIDO y la cadena queda revocada igual', async () => {
    const { sesiones, reloj, renovar, ingresar, auditoria } = preparar();
    const inicial = await ingresar();
    const renovada = await renovar.ejecutar(inicial.tokenRenovacion);
    auditoria.fallo = new Error('bitácora no disponible');

    await expect(
      codigoDelFallo(renovar.ejecutar(inicial.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');

    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(0);
    expect(sesiones.sesiones.map((s) => s.motivoRevocacion)).toEqual([
      'ROTADA',
      'REUTILIZACION',
    ]);
    await expect(
      codigoDelFallo(renovar.ejecutar(renovada.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');
  });

  it('una renovación normal no deja registro en la bitácora', async () => {
    const { renovar, ingresar, auditoria } = preparar();
    const inicial = await ingresar();

    await renovar.ejecutar(inicial.tokenRenovacion);

    expect(auditoria.acciones()).toEqual(['SESION_INICIADA']);
  });

  it('la reutilización solo revoca su familia, no otras sesiones del usuario', async () => {
    const { sesiones, reloj, renovar, ingresar } = preparar();
    const primera = await ingresar();
    await ingresar(); // otro dispositivo, otra familia
    await renovar.ejecutar(primera.tokenRenovacion);

    await renovar.ejecutar(primera.tokenRenovacion).catch(() => undefined);

    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(1);
  });

  it('D-09: si dos solicitudes rotan el mismo token a la vez, la segunda falla y revoca la familia', async () => {
    const { sesiones, reloj, renovar, ingresar } = preparar();
    const inicial = await ingresar();
    // Simula la carrera: la otra solicitud ya rotó el token entre la lectura y la escritura.
    const guardar = sesiones.guardarRotacion.bind(sesiones);
    sesiones.guardarRotacion = async () => {
      sesiones.guardarRotacion = guardar;
      return false;
    };

    await expect(
      codigoDelFallo(renovar.ejecutar(inicial.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');
    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(0);
  });

  it('un token inexistente → TOKEN_INVALIDO', async () => {
    const { renovar } = preparar();

    await expect(codigoDelFallo(renovar.ejecutar('no-existe'))).resolves.toBe(
      'TOKEN_INVALIDO',
    );
  });

  it('un token vencido (7 días) → TOKEN_INVALIDO y no crea sesión', async () => {
    const { sesiones, reloj, renovar, ingresar } = preparar();
    const inicial = await ingresar();
    reloj.avanzar(7 * UN_DIA_MS);

    await expect(
      codigoDelFallo(renovar.ejecutar(inicial.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');
    expect(sesiones.sesiones).toHaveLength(1);
  });

  it('un token cerrado (salida) → TOKEN_INVALIDO', async () => {
    const { sesiones, reloj, renovar, ingresar } = preparar();
    const inicial = await ingresar();
    await sesiones.revocarFamilia(
      sesiones.sesiones[0].familia,
      'CERRADA',
      reloj.ahora(),
    );

    await expect(
      codigoDelFallo(renovar.ejecutar(inicial.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');
    expect(sesiones.sesiones[0].motivoRevocacion).toBe('CERRADA');
  });

  it('una cuenta inactiva → TOKEN_INVALIDO sin rotar', async () => {
    const { usuarios, sesiones, reloj, renovar, ingresar } = preparar();
    const inicial = await ingresar();
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);

    await expect(
      codigoDelFallo(renovar.ejecutar(inicial.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');
    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(1);
  });

  it('un usuario que ya no existe → TOKEN_INVALIDO', async () => {
    const { usuarios, renovar, ingresar } = preparar();
    const inicial = await ingresar();
    usuarios.usuarios.length = 0;

    await expect(
      codigoDelFallo(renovar.ejecutar(inicial.tokenRenovacion)),
    ).resolves.toBe('TOKEN_INVALIDO');
  });
});
