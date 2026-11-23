import { Correo } from '../../dominio/correo.js';
import { LimiteEliminacionCuentaMemoria } from '../../infraestructura/seguridad/limite-eliminacion-cuenta.memoria.js';
import { EliminadorCuenta } from '../eliminador-cuenta.js';
import {
  AuditoriaFalsa,
  CLAVE_VALIDA,
  CodigoRecuperacionRepositorioEnMemoria,
  conCorreoVerificado,
  crearCliente,
  crearVendedor,
  EnviadorCorreoFalso,
  GeneradorHashFalso,
  generadorIdSecuencial,
  GeneradorTokenFalso,
  INICIO,
  ProtectorCodigoFalso,
  RelojFalso,
  SesionRepositorioEnMemoria,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import { EliminarCuentaCasoUso } from './eliminar-cuenta.caso-uso.js';
import { EliminarCuentaPorCodigoCasoUso } from './eliminar-cuenta-por-codigo.caso-uso.js';
import { SolicitarEliminacionCuentaCasoUso } from './solicitar-eliminacion-cuenta.caso-uso.js';
import { Sesion } from '../../dominio/sesion.js';

const ID_CLIENTE = '00000000-0000-4000-8000-0000000000c1';
const ID_VENDEDOR = '00000000-0000-4000-8000-0000000000aa';
const CORREO = 'maria@ejemplo.test';

describe('RF-USU-06 / PA-21: eliminar la cuenta (casos de uso)', () => {
  let usuarios: UsuarioRepositorioEnMemoria;
  let sesiones: SesionRepositorioEnMemoria;
  let codigos: CodigoRecuperacionRepositorioEnMemoria;
  let hash: GeneradorHashFalso;
  let auditoria: AuditoriaFalsa;
  let unidad: UnidadDeTrabajoFalsa;
  let reloj: RelojFalso;
  let protector: ProtectorCodigoFalso;
  let correo: EnviadorCorreoFalso;
  let limite: LimiteEliminacionCuentaMemoria;
  let eliminarApp: EliminarCuentaCasoUso;
  let solicitar: SolicitarEliminacionCuentaCasoUso;
  let eliminarWeb: EliminarCuentaPorCodigoCasoUso;

  beforeEach(async () => {
    usuarios = new UsuarioRepositorioEnMemoria();
    sesiones = new SesionRepositorioEnMemoria();
    codigos = new CodigoRecuperacionRepositorioEnMemoria();
    hash = new GeneradorHashFalso();
    unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    reloj = new RelojFalso();
    protector = new ProtectorCodigoFalso();
    correo = new EnviadorCorreoFalso();
    limite = new LimiteEliminacionCuentaMemoria();
    const eliminador = new EliminadorCuenta(
      usuarios,
      sesiones,
      codigos,
      hash,
      new GeneradorTokenFalso(),
      reloj,
      unidad,
      auditoria,
    );
    eliminarApp = new EliminarCuentaCasoUso(usuarios, hash, limite, eliminador, reloj);
    solicitar = new SolicitarEliminacionCuentaCasoUso(
      usuarios,
      codigos,
      protector,
      correo,
      generadorIdSecuencial(),
      reloj,
      unidad,
      auditoria,
    );
    eliminarWeb = new EliminarCuentaPorCodigoCasoUso(
      usuarios,
      codigos,
      protector,
      eliminador,
      reloj,
      unidad,
    );
    await usuarios.crear(conCorreoVerificado(crearCliente(ID_CLIENTE, CORREO)));
    await usuarios.crear(conCorreoVerificado(crearVendedor(ID_VENDEDOR, 'vendedor@ejemplo.test')));
  });

  const cliente = () => usuarios.usuarios.find((u) => u.id === ID_CLIENTE)!;

  describe('por la app (con la clave)', () => {
    it('clave correcta: anonimiza, inactiva, guarda eliminadoEn y registra CUENTA_ELIMINADA sin datos personales', async () => {
      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });

      const u = cliente();
      expect(u.estaEliminada()).toBe(true);
      expect(u.activo).toBe(false);
      expect(u.eliminadoEn).toEqual(INICIO);
      expect(u.nombre.valor).toBe('Cuenta eliminada');
      expect(u.correo.valor).toBe(`eliminada-${ID_CLIENTE}@eliminada.invalid`);
      expect(u.telefono.valor).toMatch(/^\+000\d{9}$/);
      expect(u.hashClave).not.toBe(`hash:${CLAVE_VALIDA}`);
      expect(auditoria.registradas).toHaveLength(1);
      expect(auditoria.registradas[0]).toMatchObject({
        enTransaccion: true,
        actividad: {
          accion: 'CUENTA_ELIMINADA',
          idUsuario: ID_CLIENTE,
          detalle: { idUsuario: ID_CLIENTE, via: 'APP' },
        },
      });
      expect(JSON.stringify(auditoria.registradas)).not.toContain(CORREO);
      expect(JSON.stringify(auditoria.registradas)).not.toContain('Cliente de Prueba');
    });

    it('revoca las sesiones y borra los códigos pendientes', async () => {
      await sesiones.crear(
        Sesion.iniciar({
          id: 's1',
          idUsuario: ID_CLIENTE,
          familia: 'f1',
          canal: 'APP',
          hashToken: 'h1',
          ahora: INICIO,
          vidaDias: 7,
        }),
      );
      await solicitar.ejecutar(CORREO);
      expect(codigos.codigos).toHaveLength(1);

      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });

      expect(sesiones.vigentes(INICIO)).toHaveLength(0);
      expect(codigos.codigos).toHaveLength(0);
    });

    it('clave incorrecta → 422 CLAVE_ACTUAL_INCORRECTA y la cuenta queda intacta', async () => {
      await expect(
        eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: 'Otra2026clave' }),
      ).rejects.toMatchObject({ codigo: 'CLAVE_ACTUAL_INCORRECTA', categoria: 'REGLA_NEGOCIO' });
      expect(cliente().estaEliminada()).toBe(false);
      expect(cliente().correo.valor).toBe(CORREO);
      expect(auditoria.registradas).toHaveLength(0);
    });

    it('el Vendedor no puede eliminarse → NO_AUTORIZADO y nada cambia', async () => {
      await expect(
        eliminarApp.ejecutar({ idUsuario: ID_VENDEDOR, clave: CLAVE_VALIDA }),
      ).rejects.toMatchObject({ codigo: 'NO_AUTORIZADO' });
      expect(usuarios.usuarios.find((u) => u.id === ID_VENDEDOR)!.estaEliminada()).toBe(false);
    });

    it('una cuenta ya eliminada responde 401 (como una inexistente)', async () => {
      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });
      await expect(
        eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA }),
      ).rejects.toMatchObject({ categoria: 'NO_AUTENTICADO' });
      expect(auditoria.registradas).toHaveLength(1);
    });

    it('D-17: 3 intentos por hora y cuenta; el cuarto → 429 aunque la clave sea correcta, y vuelve a servir pasada la hora', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: 'Mala2026clave' }),
        ).rejects.toMatchObject({ codigo: 'CLAVE_ACTUAL_INCORRECTA' });
      }
      await expect(
        eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA }),
      ).rejects.toMatchObject({
        codigo: 'DEMASIADAS_SOLICITUDES',
        categoria: 'DEMASIADAS_SOLICITUDES',
        detalles: { reintentarEnSegundos: expect.any(Number) as number },
      });
      expect(cliente().estaEliminada()).toBe(false);

      reloj.avanzar(60 * 60 * 1000 + 1000);
      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });
      expect(cliente().estaEliminada()).toBe(true);
    });

    it('el límite es por cuenta: los intentos de otra no cuentan', async () => {
      const otro = '00000000-0000-4000-8000-0000000000c2';
      await usuarios.crear(crearCliente(otro, 'jose@ejemplo.test'));
      for (let i = 0; i < 3; i++) {
        await expect(
          eliminarApp.ejecutar({ idUsuario: otro, clave: 'Mala2026clave' }),
        ).rejects.toMatchObject({ codigo: 'CLAVE_ACTUAL_INCORRECTA' });
      }
      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });
      expect(cliente().estaEliminada()).toBe(true);
    });
  });

  describe('por la web (con un código al correo)', () => {
    it('cuenta válida: se envía un solo código al correo registrado, con propósito ELIMINACION_CUENTA, y se registra CODIGO_CORREO_ENVIADO sin el código', async () => {
      const { envio } = await solicitar.ejecutar('  Maria@Ejemplo.TEST ');
      await envio;

      expect(correo.enviados).toHaveLength(1);
      expect(correo.enviados[0].para).toBe(CORREO);
      expect(correo.enviados[0].texto).toContain(protector.generados[0]);
      expect(codigos.codigos).toHaveLength(1);
      expect(codigos.codigos[0].proposito).toBe('ELIMINACION_CUENTA');
      expect(codigos.codigos[0].hashCodigo).not.toContain(protector.generados[0] + 'x');
      expect(auditoria.acciones()).toEqual(['CODIGO_CORREO_ENVIADO']);
      expect(JSON.stringify(auditoria.registradas)).not.toContain(protector.generados[0]);
    });

    it.each([
      ['correo inexistente', 'nadie@ejemplo.test'],
      ['correo con formato inválido', 'no-es-correo'],
      ['correo del Vendedor', 'vendedor@ejemplo.test'],
    ])('%s → no se envía nada y se registra SOLICITUD_RECUPERACION_IGNORADA', async (_nombre, intentado) => {
      const { envio } = await solicitar.ejecutar(intentado);
      await envio;
      expect(correo.enviados).toHaveLength(0);
      expect(codigos.codigos).toHaveLength(0);
      expect(auditoria.acciones()).toEqual(['SOLICITUD_RECUPERACION_IGNORADA']);
    });

    it('correo sin verificar o cuenta ya eliminada → no se envía nada', async () => {
      await usuarios.crear(crearCliente('00000000-0000-4000-8000-0000000000c3', 'sin@ejemplo.test'));
      await (await solicitar.ejecutar('sin@ejemplo.test')).envio;
      expect(correo.enviados).toHaveLength(0);

      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });
      await (await solicitar.ejecutar(CORREO)).envio;
      expect(correo.enviados).toHaveLength(0);
    });

    it('3 envíos por hora y cuenta: el cuarto no envía y queda LIMITE_HORARIO', async () => {
      for (let i = 0; i < 4; i++) {
        await (await solicitar.ejecutar(CORREO)).envio;
      }
      expect(correo.enviados).toHaveLength(3);
      const ultima = auditoria.registradas.at(-1)!.actividad;
      expect(ultima).toMatchObject({
        accion: 'SOLICITUD_RECUPERACION_IGNORADA',
        detalle: { motivo: 'LIMITE_HORARIO' },
      });
    });

    it('un fallo del servicio de correo no cambia el resultado: la solicitud no falla', async () => {
      correo.fallar = true;
      const { envio } = await solicitar.ejecutar(CORREO);
      await expect(envio).resolves.toBeUndefined();
    });

    it('código correcto → elimina la cuenta (via WEB), borra los códigos y no se puede reutilizar', async () => {
      await (await solicitar.ejecutar(CORREO)).envio;
      const codigo = protector.generados[0];

      await eliminarWeb.ejecutar({ correo: CORREO, codigo });

      expect(cliente().estaEliminada()).toBe(true);
      expect(codigos.codigos).toHaveLength(0);
      expect(auditoria.registradas.at(-1)!.actividad).toMatchObject({
        accion: 'CUENTA_ELIMINADA',
        detalle: { idUsuario: ID_CLIENTE, via: 'WEB' },
      });
      await expect(eliminarWeb.ejecutar({ correo: CORREO, codigo })).rejects.toMatchObject({
        codigo: 'CODIGO_INVALIDO',
      });
    });

    it('código incorrecto → 422 CODIGO_INVALIDO y suma intentos; al quinto el correcto ya no sirve', async () => {
      await (await solicitar.ejecutar(CORREO)).envio;
      const bueno = protector.generados[0];
      for (let i = 0; i < 5; i++) {
        await expect(
          eliminarWeb.ejecutar({ correo: CORREO, codigo: '000000' }),
        ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO', categoria: 'REGLA_NEGOCIO' });
      }
      await expect(eliminarWeb.ejecutar({ correo: CORREO, codigo: bueno })).rejects.toMatchObject({
        codigo: 'CODIGO_INVALIDO',
      });
      expect(cliente().estaEliminada()).toBe(false);
    });

    it('código vencido (más de 15 minutos) → 422 y la cuenta queda intacta', async () => {
      await (await solicitar.ejecutar(CORREO)).envio;
      const codigo = protector.generados[0];
      reloj.avanzar(16 * 60 * 1000);
      await expect(eliminarWeb.ejecutar({ correo: CORREO, codigo })).rejects.toMatchObject({
        codigo: 'CODIGO_INVALIDO',
      });
      expect(cliente().estaEliminada()).toBe(false);
    });

    it('un código de recuperación o de verificación nunca elimina la cuenta', async () => {
      const { CodigoRecuperacion } = await import('../../dominio/codigo-recuperacion.js');
      for (const proposito of ['RECUPERACION_CORREO', 'VERIFICACION_CORREO'] as const) {
        await codigos.emitir(
          CodigoRecuperacion.generar({
            id: `id-${proposito}`,
            idUsuario: ID_CLIENTE,
            hashCodigo: protector.calcularHash('123456'),
            proposito,
            generadoPor: null,
            ahora: INICIO,
          }),
          INICIO,
        );
        await expect(
          eliminarWeb.ejecutar({ correo: CORREO, codigo: '123456' }),
        ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
      }
      expect(cliente().estaEliminada()).toBe(false);
    });

    it('el Vendedor no se elimina por la web aunque tenga un código', async () => {
      await expect(
        eliminarWeb.ejecutar({ correo: 'vendedor@ejemplo.test', codigo: '123456' }),
      ).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
    });

    it('un código con formato inválido es 400 DATOS_INVALIDOS', async () => {
      await expect(
        eliminarWeb.ejecutar({ correo: CORREO, codigo: '12ab' }),
      ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
    });
  });

  describe('después de eliminar', () => {
    it('el correo original queda libre para registrar otra cuenta y la anonimizada no se encuentra', async () => {
      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });

      expect(await usuarios.buscarPorCorreo(Correo.crear(CORREO))).toBeNull();
      await expect(
        usuarios.crear(crearCliente('00000000-0000-4000-8000-0000000000c9', CORREO)),
      ).resolves.toBeUndefined();
    });

    it('la lista de clientes del Vendedor no incluye las cuentas eliminadas', async () => {
      await eliminarApp.ejecutar({ idUsuario: ID_CLIENTE, clave: CLAVE_VALIDA });
      const pagina = await usuarios.listarClientes(null, { pagina: 1, tamanio: 10 });
      expect(pagina.total).toBe(0);
    });
  });
});
