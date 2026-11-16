import { CambiarEstadoUsuarioCasoUso } from './cambiar-estado-usuario.caso-uso.js';
import {
  AuditoriaFalsa,
  crearCliente,
  crearVendedor,
  desactivar,
  generadorIdSecuencial,
  INICIO,
  RelojFalso,
  SesionRepositorioEnMemoria,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import { Sesion } from '../../dominio/sesion.js';

const ID_CLIENTE = 'id-cliente';
const ID_VENDEDOR = 'id-vendedor';

function preparar() {
  const usuarios = new UsuarioRepositorioEnMemoria();
  usuarios.usuarios.push(
    crearCliente(ID_CLIENTE, 'cliente@ejemplo.test'),
    crearCliente('id-otro', 'otro@ejemplo.test'),
    crearVendedor(ID_VENDEDOR, 'vendedor@ejemplo.test'),
  );
  const sesiones = new SesionRepositorioEnMemoria();
  const ids = generadorIdSecuencial();
  for (const [indice, idUsuario] of [ID_CLIENTE, ID_CLIENTE, 'id-otro'].entries()) {
    sesiones.sesiones.push(
      Sesion.iniciar({
        id: ids.generar(),
        idUsuario,
        familia: ids.generar(),
        canal: 'APP',
        hashToken: `h(token-${indice})`,
        ahora: INICIO,
        vidaDias: 7,
      }),
    );
  }
  const unidad = new UnidadDeTrabajoFalsa();
  const auditoria = new AuditoriaFalsa(unidad);
  const casoUso = new CambiarEstadoUsuarioCasoUso(
    usuarios,
    sesiones,
    new RelojFalso(),
    unidad,
    auditoria,
  );
  return { usuarios, sesiones, auditoria, casoUso };
}

describe('D-53: CambiarEstadoUsuarioCasoUso', () => {
  it('desactivar: deja la cuenta inactiva, revoca todas sus sesiones y registra CLIENTE_DESACTIVADO con solo { idUsuario }, en la misma transacción', async () => {
    const { usuarios, sesiones, auditoria, casoUso } = preparar();

    const publico = await casoUso.ejecutar({
      idVendedor: ID_VENDEDOR,
      idUsuario: ID_CLIENTE,
      activo: false,
    });

    expect(publico).toMatchObject({ id: ID_CLIENTE, activo: false });
    expect(usuarios.usuarios[0].activo).toBe(false);
    expect(
      sesiones.vigentes(INICIO).map((sesion) => sesion.idUsuario),
    ).toEqual(['id-otro']);
    expect(auditoria.registradas).toEqual([
      {
        actividad: {
          accion: 'CLIENTE_DESACTIVADO',
          idUsuario: ID_VENDEDOR,
          entidad: 'USUARIO',
          idEntidad: ID_CLIENTE,
          detalle: { idUsuario: ID_CLIENTE },
        },
        enTransaccion: true,
        sinInterrumpir: false,
      },
    ]);
  });

  it('reactivar: deja la cuenta activa y registra CLIENTE_REACTIVADO con solo { idUsuario }', async () => {
    const { usuarios, auditoria, casoUso } = preparar();
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);

    const publico = await casoUso.ejecutar({
      idVendedor: ID_VENDEDOR,
      idUsuario: ID_CLIENTE,
      activo: true,
    });

    expect(publico).toMatchObject({ id: ID_CLIENTE, activo: true });
    expect(auditoria.registradas).toHaveLength(1);
    expect(auditoria.registradas[0].actividad).toEqual({
      accion: 'CLIENTE_REACTIVADO',
      idUsuario: ID_VENDEDOR,
      entidad: 'USUARIO',
      idEntidad: ID_CLIENTE,
      detalle: { idUsuario: ID_CLIENTE },
    });
  });

  it('idempotente: si ya está en ese estado devuelve la cuenta sin escribir, revocar ni registrar', async () => {
    const { usuarios, sesiones, auditoria, casoUso } = preparar();

    const yaActiva = await casoUso.ejecutar({
      idVendedor: ID_VENDEDOR,
      idUsuario: ID_CLIENTE,
      activo: true,
    });
    usuarios.usuarios[0] = desactivar(usuarios.usuarios[0]);
    const vigentesAntes = sesiones.vigentes(INICIO).length;
    const yaInactiva = await casoUso.ejecutar({
      idVendedor: ID_VENDEDOR,
      idUsuario: ID_CLIENTE,
      activo: false,
    });

    expect(yaActiva.activo).toBe(true);
    expect(yaInactiva.activo).toBe(false);
    expect(auditoria.registradas).toHaveLength(0);
    expect(sesiones.vigentes(INICIO)).toHaveLength(vigentesAntes);
  });

  it('el Vendedor no se puede desactivar: 422 OPERACION_NO_PERMITIDA, sin cambios ni bitácora', async () => {
    const { usuarios, auditoria, casoUso } = preparar();

    await expect(
      casoUso.ejecutar({
        idVendedor: ID_VENDEDOR,
        idUsuario: ID_VENDEDOR,
        activo: false,
      }),
    ).rejects.toMatchObject({
      codigo: 'OPERACION_NO_PERMITIDA',
      categoria: 'REGLA_NEGOCIO',
    });
    expect(usuarios.usuarios[2].activo).toBe(true);
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('un id inexistente: 404 USUARIO_NO_ENCONTRADO', async () => {
    const { auditoria, casoUso } = preparar();

    await expect(
      casoUso.ejecutar({
        idVendedor: ID_VENDEDOR,
        idUsuario: 'no-existe',
        activo: false,
      }),
    ).rejects.toMatchObject({
      codigo: 'USUARIO_NO_ENCONTRADO',
      categoria: 'NO_ENCONTRADO',
    });
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('si la bitácora falla, el caso de uso falla (la transacción deshace el cambio)', async () => {
    const { auditoria, casoUso } = preparar();
    const fallo = new Error('bitácora no disponible');
    auditoria.fallo = fallo;

    await expect(
      casoUso.ejecutar({
        idVendedor: ID_VENDEDOR,
        idUsuario: ID_CLIENTE,
        activo: false,
      }),
    ).rejects.toBe(fallo);
  });
});
