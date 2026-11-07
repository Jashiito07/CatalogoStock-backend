import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import type { RegistrarActividad } from '../servicio-auditoria.js';
import {
  RegistroActividadRepositorioEnMemoria,
  RegistroTecnicoFalso,
} from './dobles.prueba-spec.js';
import { RegistrarActividadCasoUso } from './registrar-actividad.caso-uso.js';

const AHORA = new Date('2026-11-05T15:16:02.000Z');
const ID_REGISTRO = '00000000-0000-4000-8000-0000000000a1';
const ID_USUARIO = '00000000-0000-4000-8000-0000000000b1';

function preparar() {
  const repositorio = new RegistroActividadRepositorioEnMemoria();
  const registroTecnico = new RegistroTecnicoFalso();
  const servicio = new RegistrarActividadCasoUso(
    repositorio,
    { generar: () => ID_REGISTRO },
    { ahora: () => AHORA },
    registroTecnico,
  );
  return { repositorio, registroTecnico, servicio };
}

const FALLIDA: RegistrarActividad = {
  accion: 'SESION_FALLIDA',
  idUsuario: null,
  entidad: 'SESION',
  idEntidad: null,
  detalle: {
    correo: ' Intento@Correo.COM',
    canal: 'APP',
    motivo: 'CREDENCIALES_INVALIDAS',
  },
};

describe('RF-USU-04: servicio público de la bitácora (RegistrarActividadCasoUso)', () => {
  it('registrar guarda el registro con id y fecha del servidor', async () => {
    const { repositorio, servicio } = preparar();

    await servicio.registrar({
      accion: 'USUARIO_REGISTRADO',
      idUsuario: ID_USUARIO,
      entidad: 'USUARIO',
      idEntidad: ID_USUARIO,
      detalle: { rol: 'CLIENTE' },
    });

    expect(repositorio.registros).toHaveLength(1);
    const [registro] = repositorio.registros;
    expect(registro.id).toBe(ID_REGISTRO);
    expect(registro.fecha).toEqual(AHORA);
    expect(registro.accion).toBe('USUARIO_REGISTRADO');
    expect(registro.detalle).toEqual({ rol: 'CLIENTE' });
    // Dentro de la transacción en curso, no fuera.
    expect(repositorio.fueraDeTransaccion).toHaveLength(0);
  });

  it('sin detalle guarda {}', async () => {
    const { repositorio, servicio } = preparar();

    await servicio.registrar({
      accion: 'SESION_CERRADA',
      idUsuario: ID_USUARIO,
      entidad: 'SESION',
      idEntidad: ID_USUARIO,
    });

    expect(repositorio.registros[0].detalle).toEqual({});
  });

  it('registrar propaga los errores (la transacción de la operación se deshace, CA-03)', async () => {
    const { repositorio, servicio } = preparar();
    const fallo = new Error('sin conexión');
    repositorio.fallo = fallo;

    await expect(
      servicio.registrar({
        accion: 'SESION_CERRADA',
        idUsuario: ID_USUARIO,
        entidad: 'SESION',
        idEntidad: ID_USUARIO,
      }),
    ).rejects.toBe(fallo);
  });

  it('un registro inválido (entidad que no corresponde) falla con DATOS_INVALIDOS y no guarda nada', async () => {
    const { repositorio, servicio } = preparar();

    await expect(
      servicio.registrar({
        accion: 'USUARIO_REGISTRADO',
        idUsuario: ID_USUARIO,
        entidad: 'SESION',
        idEntidad: ID_USUARIO,
      }),
    ).rejects.toBeInstanceOf(DatosInvalidosError);
    expect(repositorio.registros).toHaveLength(0);
  });

  it('Seguridad: elimina los campos prohibidos y avisa en el log técnico solo con sus nombres', async () => {
    const { repositorio, registroTecnico, servicio } = preparar();

    await servicio.registrar({
      accion: 'SESION_INICIADA',
      idUsuario: ID_USUARIO,
      entidad: 'SESION',
      idEntidad: ID_USUARIO,
      detalle: {
        rol: 'CLIENTE',
        clave: 'Catalogo2026',
        tokenRenovacion: 'q9Z-token',
      },
    });

    expect(repositorio.registros[0].detalle).toEqual({ rol: 'CLIENTE' });
    expect(registroTecnico.advertencias).toEqual([
      'Se descartaron campos no permitidos del detalle de SESION_INICIADA: clave, tokenRenovacion.',
    ]);
    expect(registroTecnico.advertencias.join()).not.toContain('Catalogo2026');
    expect(registroTecnico.advertencias.join()).not.toContain('q9Z');
  });

  it('D-20: registrarSinInterrumpir guarda fuera de transacción el correo intentado en minúsculas', async () => {
    const { repositorio, registroTecnico, servicio } = preparar();

    await servicio.registrarSinInterrumpir(FALLIDA);

    expect(repositorio.fueraDeTransaccion).toHaveLength(1);
    expect(repositorio.fueraDeTransaccion[0].detalle).toEqual({
      correo: 'intento@correo.com',
      canal: 'APP',
      motivo: 'CREDENCIALES_INVALIDAS',
    });
    expect(registroTecnico.errores).toEqual([]);
  });

  it('CA-02: registrarSinInterrumpir nunca falla; avisa sin datos personales ni el mensaje del error', async () => {
    const { repositorio, registroTecnico, servicio } = preparar();
    repositorio.fallo = new TypeError(
      'valor de entrada inválido: "intento@correo.com"',
    );

    await expect(servicio.registrarSinInterrumpir(FALLIDA)).resolves.toBe(
      undefined,
    );

    expect(registroTecnico.errores).toEqual([
      'No se pudo registrar SESION_FALLIDA en la bitácora (TypeError).',
    ]);
    expect(registroTecnico.errores.join()).not.toContain('intento');
  });

  it('registrarSinInterrumpir tampoco falla con un registro inválido', async () => {
    const { repositorio, registroTecnico, servicio } = preparar();

    await servicio.registrarSinInterrumpir({
      ...FALLIDA,
      idUsuario: 'no-es-uuid',
    });

    expect(repositorio.registros).toHaveLength(0);
    expect(registroTecnico.errores).toEqual([
      'No se pudo registrar SESION_FALLIDA en la bitácora (DatosInvalidosError).',
    ]);
  });
});
