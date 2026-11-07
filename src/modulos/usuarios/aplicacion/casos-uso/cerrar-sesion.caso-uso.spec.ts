import { CerrarSesionCasoUso } from './cerrar-sesion.caso-uso.js';
import {
  AuditoriaFalsa,
  CLAVE_VALIDA,
  CONFIGURACION,
  crearCliente,
  EmisorTokenAccesoFalso,
  GeneradorHashFalso,
  generadorIdSecuencial,
  GeneradorTokenFalso,
  RelojFalso,
  SesionRepositorioEnMemoria,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import { IniciarSesionCasoUso } from './iniciar-sesion.caso-uso.js';
import { RenovarSesionCasoUso } from './renovar-sesion.caso-uso.js';

function preparar() {
  const usuarios = new UsuarioRepositorioEnMemoria();
  usuarios.usuarios.push(
    crearCliente('id-ana', 'ana@ejemplo.test'),
    crearCliente('id-beto', 'beto@ejemplo.test'),
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
  const cerrar = new CerrarSesionCasoUso(
    sesiones,
    tokens,
    reloj,
    unidad,
    auditoria,
  );
  const ingresar = (correo: string) =>
    iniciar.ejecutar({ canal: 'APP', correo, clave: CLAVE_VALIDA });
  return { sesiones, reloj, renovar, cerrar, ingresar, auditoria };
}

describe('RF-USU-04: CerrarSesionCasoUso registra SESION_CERRADA', () => {
  it('al cerrar deja SESION_CERRADA con el usuario, la sesión del token y detalle {}, en la misma transacción', async () => {
    const { cerrar, ingresar, auditoria, sesiones } = preparar();
    const sesion = await ingresar('ana@ejemplo.test');

    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: sesion.tokenRenovacion,
    });

    expect(auditoria.registradas.at(-1)).toEqual({
      actividad: {
        accion: 'SESION_CERRADA',
        idUsuario: 'id-ana',
        entidad: 'SESION',
        idEntidad: sesiones.sesiones[0].id,
        detalle: {},
      },
      enTransaccion: true,
      sinInterrumpir: false,
    });
  });

  it('repetir la salida, un token desconocido o uno de otro usuario no dejan registro', async () => {
    const { cerrar, ingresar, auditoria } = preparar();
    const deAna = await ingresar('ana@ejemplo.test');
    const deBeto = await ingresar('beto@ejemplo.test');
    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: deAna.tokenRenovacion,
    });

    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: deAna.tokenRenovacion,
    });
    await cerrar.ejecutar({ idUsuario: 'id-ana', tokenRenovacion: 'otro' });
    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: deBeto.tokenRenovacion,
    });

    expect(auditoria.acciones()).toEqual([
      'SESION_INICIADA',
      'SESION_INICIADA',
      'SESION_CERRADA',
    ]);
  });
});

describe('RF-USU-01 / D-09: CerrarSesionCasoUso', () => {
  it('revoca la familia del token y después la renovación falla', async () => {
    const { sesiones, reloj, renovar, cerrar, ingresar } = preparar();
    const sesion = await ingresar('ana@ejemplo.test');

    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: sesion.tokenRenovacion,
    });

    expect(sesiones.sesiones[0].motivoRevocacion).toBe('CERRADA');
    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(0);
    await expect(
      renovar.ejecutar(sesion.tokenRenovacion),
    ).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
    });
  });

  it('cerrar con un token antiguo de la cadena revoca también el token vigente', async () => {
    const { sesiones, reloj, renovar, cerrar, ingresar } = preparar();
    const inicial = await ingresar('ana@ejemplo.test');
    await renovar.ejecutar(inicial.tokenRenovacion);

    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: inicial.tokenRenovacion,
    });

    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(0);
  });

  it('es idempotente: un token desconocido o ya revocado termina sin error', async () => {
    const { cerrar, ingresar } = preparar();
    const sesion = await ingresar('ana@ejemplo.test');

    await expect(
      cerrar.ejecutar({ idUsuario: 'id-ana', tokenRenovacion: 'desconocido' }),
    ).resolves.toBeUndefined();
    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: sesion.tokenRenovacion,
    });
    await expect(
      cerrar.ejecutar({
        idUsuario: 'id-ana',
        tokenRenovacion: sesion.tokenRenovacion,
      }),
    ).resolves.toBeUndefined();
  });

  it('CA-02: el token de otro usuario no se revoca', async () => {
    const { sesiones, reloj, cerrar, ingresar } = preparar();
    const deBeto = await ingresar('beto@ejemplo.test');

    await cerrar.ejecutar({
      idUsuario: 'id-ana',
      tokenRenovacion: deBeto.tokenRenovacion,
    });

    expect(sesiones.vigentes(reloj.ahora())).toHaveLength(1);
  });
});
