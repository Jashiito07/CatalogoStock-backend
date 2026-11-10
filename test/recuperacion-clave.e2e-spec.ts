import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import {
  CrearVendedorCasoUso,
  RestablecerClaveVendedorCasoUso,
} from '../src/modulos/usuarios/index.js';
import {
  type AlmacenLimiteReiniciable,
  type AppPruebas,
  crearAppPruebas,
} from './preparacion/app-pruebas.js';

/**
 * e2e de RF-USU-05 (D-35, D-39; contrato de recuperación de clave, «Pruebas
 * mínimas») contra `catalogostock_pruebas` (D-23). Datos ficticios.
 */

const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_NUEVA = 'NuevaClave2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const CORREO_MARIA = 'maria.zambrano@ejemplo.test';
const CORREO_JOSE = 'jose.pena@ejemplo.test';

const CODIGO_INVALIDO = {
  codigo: 'CODIGO_INVALIDO',
  mensaje: 'El código no es válido o ya venció. Pide uno nuevo a tu vendedor.',
  detalles: {},
};

const NO_AUTORIZADO = {
  codigo: 'NO_AUTORIZADO',
  mensaje: 'No tiene permiso para realizar esta acción.',
  detalles: {},
};

interface CuerpoSesion {
  tokenAcceso: string;
  tokenRenovacion: string;
  usuario: { id: string; rol: string };
}

interface CuerpoCodigo {
  codigo: string;
  venceEn: string;
  cliente: { id: string; nombre: string; correo: string };
}

interface FilaAuditoria {
  accion: string;
  id_usuario: string | null;
  id_entidad: string | null;
  entidad: string | null;
  detalle: Record<string, unknown>;
}

function conToken<T extends { set(c: string, v: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

function ids(cuerpo: { elementos: { id: string }[] }): string[] {
  return cuerpo.elementos.map((e) => e.id);
}

describe('RF-USU-05 (e2e): recuperación asistida y cambio de clave', () => {
  let contexto: AppPruebas;

  const http = () => request(contexto.app.getHttpServer());

  const ingresar = (
    canal: 'cliente' | 'vendedor',
    correo: string,
    clave: string,
  ) =>
    http()
      .post(`/api/v1/autenticacion/ingreso/${canal}`)
      .send({ correo, clave });

  const renovar = (tokenRenovacion: string) =>
    http().post('/api/v1/autenticacion/renovacion').send({ tokenRenovacion });

  const recuperar = (
    correo: string,
    codigo: string,
    claveNueva = CLAVE_NUEVA,
  ) =>
    http()
      .post('/api/v1/autenticacion/recuperacion')
      .send({ correo, codigo, claveNueva });

  const generarCodigo = (tokenAcceso: string, idCliente: string) =>
    conToken(
      http().post(`/api/v1/usuarios/${idCliente}/codigo-recuperacion`),
      tokenAcceso,
    );

  const cambiarClave = (tokenAcceso: string, cuerpo: Record<string, unknown>) =>
    conToken(http().post('/api/v1/usuarios/yo/clave'), tokenAcceso).send(
      cuerpo,
    );

  /** Reinicia el límite de intentos sin vaciar las tablas. */
  function reiniciarLimite(): void {
    contexto.app.get<AlmacenLimiteReiniciable>(getStorageToken()).reiniciar();
  }

  async function crearVendedor(): Promise<string> {
    const resultado = await contexto.app.get(CrearVendedorCasoUso).ejecutar({
      nombre: 'Vendedor de Prueba',
      correo: CORREO_VENDEDOR,
      telefono: '0987654321',
      clave: CLAVE_VENDEDOR,
    });
    if (!resultado.creado) {
      throw new Error('No se creó el Vendedor de prueba');
    }
    return resultado.idUsuario;
  }

  async function registrar(
    nombre: string,
    correo: string,
    telefono: string,
  ): Promise<string> {
    const respuesta = await http()
      .post('/api/v1/usuarios/registro')
      .send({
        nombre,
        correo,
        telefono,
        clave: CLAVE,
        aceptaPrivacidad: true,
        versionPrivacidad: VERSION_AVISO,
      })
      .expect(201);
    return (respuesta.body as { id: string }).id;
  }

  async function sesionVendedor(): Promise<CuerpoSesion> {
    await crearVendedor();
    const respuesta = await ingresar(
      'vendedor',
      CORREO_VENDEDOR,
      CLAVE_VENDEDOR,
    ).expect(200);
    return respuesta.body as CuerpoSesion;
  }

  async function sesionMaria(): Promise<CuerpoSesion> {
    const respuesta = await ingresar('cliente', CORREO_MARIA, CLAVE).expect(
      200,
    );
    return respuesta.body as CuerpoSesion;
  }

  async function auditoria(accion: string): Promise<FilaAuditoria[]> {
    return contexto.fuente.query<FilaAuditoria[]>(
      `SELECT accion, id_usuario, id_entidad, entidad, detalle FROM auditoria
       WHERE accion = $1 ORDER BY fecha, id`,
      [accion],
    );
  }

  async function contar(tabla: string): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM ${tabla}`,
    );
    return Number(total);
  }

  /** Vendedor con sesión y María registrada. */
  async function preparar(): Promise<{
    vendedor: CuerpoSesion;
    idMaria: string;
  }> {
    const vendedor = await sesionVendedor();
    const idMaria = await registrar(
      'María Zambrano',
      'Maria.Zambrano@Ejemplo.test',
      '0991234567',
    );
    return { vendedor, idMaria };
  }

  async function codigoPara(
    vendedor: CuerpoSesion,
    idCliente: string,
  ): Promise<CuerpoCodigo> {
    const respuesta = await generarCodigo(
      vendedor.tokenAcceso,
      idCliente,
    ).expect(201);
    return respuesta.body as CuerpoCodigo;
  }

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  beforeEach(async () => {
    await contexto.limpiar();
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('POST /usuarios/{id}/codigo-recuperacion y POST /autenticacion/recuperacion', () => {
    it('RF-USU-05: el Vendedor genera un código → 201; el Cliente recupera → 204 y entra con la clave nueva', async () => {
      const { vendedor, idMaria } = await preparar();

      const generado = await codigoPara(vendedor, idMaria);
      expect(generado.codigo).toMatch(/^\d{6}$/);
      expect(generado.cliente).toEqual({
        id: idMaria,
        nombre: 'María Zambrano',
        correo: CORREO_MARIA,
      });
      const venceEn = new Date(generado.venceEn).getTime();
      expect(venceEn - Date.now()).toBeGreaterThan(14 * 60 * 1000);
      expect(venceEn - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);

      const respuesta = await recuperar(CORREO_MARIA, generado.codigo).expect(
        204,
      );
      expect(respuesta.text).toBe('');

      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(401);
      await ingresar('cliente', CORREO_MARIA, CLAVE_NUEVA).expect(200);

      const [restablecida] = await auditoria('CLAVE_RESTABLECIDA');
      expect(restablecida).toMatchObject({
        id_usuario: idMaria,
        entidad: 'USUARIO',
        id_entidad: idMaria,
        detalle: { origen: 'CODIGO_VENDEDOR', sesionesRevocadas: 0 },
      });
      const [fila] = await contexto.fuente.query<
        { fecha_uso: Date | null; intentos_fallidos: number }[]
      >('SELECT fecha_uso, intentos_fallidos FROM codigos_recuperacion');
      expect(fila.fecha_uso).not.toBeNull();
    });

    it('Seguridad: el código se guarda solo como hash y no aparece en la bitácora', async () => {
      const { vendedor, idMaria } = await preparar();
      const { codigo, venceEn } = await codigoPara(vendedor, idMaria);
      await recuperar(CORREO_MARIA, codigo).expect(204);

      const [fila] = await contexto.fuente.query<
        { hash_codigo: string; generado_por: string }[]
      >('SELECT hash_codigo, generado_por FROM codigos_recuperacion');
      expect(fila.hash_codigo).toMatch(/^[0-9a-f]{64}$/);
      expect(fila.hash_codigo).not.toContain(codigo);
      expect(fila.generado_por).toBe(vendedor.usuario.id);

      const [generado] = await auditoria('CODIGO_RECUPERACION_GENERADO');
      expect(generado).toMatchObject({
        id_usuario: vendedor.usuario.id,
        entidad: 'USUARIO',
        id_entidad: idMaria,
        detalle: { venceEn: new Date(venceEn).toISOString() },
      });
      const bitacora = JSON.stringify(
        await contexto.fuente.query('SELECT * FROM auditoria'),
      );
      expect(bitacora).not.toContain(`"${codigo}"`);
      expect(bitacora).not.toContain(CLAVE_NUEVA);
      expect(bitacora).not.toContain(fila.hash_codigo);
    });

    it('RF-USU-05: código incorrecto, de otro correo, usado o vencido → el mismo 422 CODIGO_INVALIDO', async () => {
      const { vendedor, idMaria } = await preparar();
      const idJose = await registrar('José Peña', CORREO_JOSE, '0997654321');
      const { codigo } = await codigoPara(vendedor, idMaria);
      const otro = codigo === '000000' ? '000001' : '000000';

      // Incorrecto.
      const incorrecto = await recuperar(CORREO_MARIA, otro).expect(422);
      expect(incorrecto.body).toEqual(CODIGO_INVALIDO);
      // Código de María con el correo de José (sin código propio).
      expect((await recuperar(CORREO_JOSE, codigo).expect(422)).body).toEqual(
        CODIGO_INVALIDO,
      );
      // Correo inexistente.
      expect(
        (await recuperar('nadie@ejemplo.test', codigo).expect(422)).body,
      ).toEqual(CODIGO_INVALIDO);
      // Usado.
      await recuperar(CORREO_MARIA, codigo).expect(204);
      reiniciarLimite();
      expect(
        (await recuperar(CORREO_MARIA, codigo, 'OtraClave2026').expect(422))
          .body,
      ).toEqual(CODIGO_INVALIDO);
      // Vencido.
      const segundo = await codigoPara(vendedor, idJose);
      await contexto.fuente.query(
        `UPDATE codigos_recuperacion
         SET fecha_creacion = now() - interval '20 minutes',
             fecha_vencimiento = now() - interval '5 minutes'
         WHERE id_usuario = $1 AND fecha_uso IS NULL`,
        [idJose],
      );
      expect(
        (await recuperar(CORREO_JOSE, segundo.codigo).expect(422)).body,
      ).toEqual(CODIGO_INVALIDO);

      const fallidas = await auditoria('RECUPERACION_FALLIDA');
      expect(fallidas.map((f) => f.detalle)).toEqual([
        { correo: CORREO_MARIA, motivo: 'CODIGO_INCORRECTO' },
        { correo: CORREO_JOSE, motivo: 'SIN_CODIGO' },
        { correo: 'nadie@ejemplo.test', motivo: 'NO_CLIENTE' },
        { correo: CORREO_MARIA, motivo: 'SIN_CODIGO' },
        { correo: CORREO_JOSE, motivo: 'VENCIDO' },
      ]);
      expect(fallidas[0].id_usuario).toBe(idMaria);
      expect(fallidas[2].id_usuario).toBeNull();
      // El código incorrecto sumó un intento al código vigente de María.
      const [intentos] = await contexto.fuente.query<
        { intentos_fallidos: number }[]
      >(
        `SELECT intentos_fallidos FROM codigos_recuperacion WHERE id_usuario = $1`,
        [idMaria],
      );
      expect(intentos.intentos_fallidos).toBe(1);
    });

    it('D-35: la cuenta del Vendedor no recupera con código → el mismo 422', async () => {
      await preparar();
      const respuesta = await recuperar(CORREO_VENDEDOR, '123456').expect(422);
      expect(respuesta.body).toEqual(CODIGO_INVALIDO);
      const [fallida] = await auditoria('RECUPERACION_FALLIDA');
      expect(fallida.detalle).toEqual({
        correo: CORREO_VENDEDOR,
        motivo: 'NO_CLIENTE',
      });
    });

    it('RF-USU-05: el quinto intento fallido invalida el código aunque luego se envíe el correcto', async () => {
      const { vendedor, idMaria } = await preparar();
      const { codigo } = await codigoPara(vendedor, idMaria);
      const otro = codigo === '999999' ? '999998' : '999999';

      for (let i = 0; i < 5; i++) {
        await recuperar(CORREO_MARIA, otro).expect(422);
      }
      reiniciarLimite();
      const respuesta = await recuperar(CORREO_MARIA, codigo).expect(422);
      expect(respuesta.body).toEqual(CODIGO_INVALIDO);

      const [fila] = await contexto.fuente.query<
        { intentos_fallidos: number; fecha_invalidacion: Date | null }[]
      >(
        'SELECT intentos_fallidos, fecha_invalidacion FROM codigos_recuperacion',
      );
      expect(fila.intentos_fallidos).toBe(5);
      expect(fila.fecha_invalidacion).not.toBeNull();
      expect((await auditoria('RECUPERACION_FALLIDA')).at(-1)?.detalle).toEqual(
        { correo: CORREO_MARIA, motivo: 'AGOTADO' },
      );
      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(200);
    });

    it('RF-USU-05: generar un código nuevo invalida el anterior', async () => {
      const { vendedor, idMaria } = await preparar();
      const primero = await codigoPara(vendedor, idMaria);
      let segundo = await codigoPara(vendedor, idMaria);
      // Si el azar repite los 6 dígitos, se genera otro para que la prueba sea clara.
      while (segundo.codigo === primero.codigo) {
        segundo = await codigoPara(vendedor, idMaria);
      }

      expect(
        (await recuperar(CORREO_MARIA, primero.codigo).expect(422)).body,
      ).toEqual(CODIGO_INVALIDO);
      await recuperar(CORREO_MARIA, segundo.codigo).expect(204);

      const [{ pendientes }] = await contexto.fuente.query<
        { pendientes: string }[]
      >(
        `SELECT count(*) AS pendientes FROM codigos_recuperacion
         WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL`,
      );
      expect(Number(pendientes)).toBe(0);
    });

    it('D-09: tras recuperar, las sesiones anteriores del Cliente ya no pueden renovarse', async () => {
      const { vendedor, idMaria } = await preparar();
      const sesion1 = await sesionMaria();
      const sesion2 = await sesionMaria();
      const { codigo } = await codigoPara(vendedor, idMaria);

      await recuperar(CORREO_MARIA, codigo).expect(204);

      await renovar(sesion1.tokenRenovacion).expect(401);
      await renovar(sesion2.tokenRenovacion).expect(401);
      // La sesión del Vendedor no se toca.
      await renovar(vendedor.tokenRenovacion).expect(200);
      const [restablecida] = await auditoria('CLAVE_RESTABLECIDA');
      expect(restablecida.detalle).toEqual({
        origen: 'CODIGO_VENDEDOR',
        sesionesRevocadas: 2,
      });
    });

    it('D-35: no se puede generar un código para el Vendedor (404); id no UUID → 400; Cliente inactivo → 422', async () => {
      const { vendedor, idMaria } = await preparar();

      const deVendedor = await generarCodigo(
        vendedor.tokenAcceso,
        vendedor.usuario.id,
      ).expect(404);
      expect(deVendedor.body.codigo).toBe('NO_ENCONTRADO');
      await generarCodigo(
        vendedor.tokenAcceso,
        '7d4f8c1e-0000-4000-8000-000000000000',
      ).expect(404);

      const invalido = await generarCodigo(
        vendedor.tokenAcceso,
        'no-es-uuid',
      ).expect(400);
      expect(invalido.body).toMatchObject({
        codigo: 'DATOS_INVALIDOS',
        detalles: { errores: [{ campo: 'id' }] },
      });

      await contexto.fuente.query(
        'UPDATE usuarios SET activo = false WHERE id = $1',
        [idMaria],
      );
      const inactivo = await generarCodigo(
        vendedor.tokenAcceso,
        idMaria,
      ).expect(422);
      expect(inactivo.body.codigo).toBe('CUENTA_INACTIVA');
      expect(await contar('codigos_recuperacion')).toBe(0);
      expect(await auditoria('CODIGO_RECUPERACION_GENERADO')).toHaveLength(0);
    });

    it('RNF-03: formato inválido → 400 DATOS_INVALIDOS sin repetir los valores y sin registrar nada', async () => {
      await preparar();
      const respuesta = await http()
        .post('/api/v1/autenticacion/recuperacion')
        .send({
          correo: 'sin-arroba',
          codigo: '12345',
          claveNueva: 'sinnumeros',
        })
        .expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      const campos = (
        respuesta.body.detalles.errores as { campo: string }[]
      ).map((e) => e.campo);
      expect(campos.toSorted()).toEqual(['claveNueva', 'codigo', 'correo']);
      expect(JSON.stringify(respuesta.body)).not.toContain('sinnumeros');
      expect(await auditoria('RECUPERACION_FALLIDA')).toHaveLength(0);
    });

    it('D-17: el sexto intento de recuperación en un minuto → 429', async () => {
      await preparar();
      for (let i = 0; i < 5; i++) {
        await recuperar(CORREO_MARIA, '123456').expect(422);
      }
      const respuesta = await recuperar(CORREO_MARIA, '123456').expect(429);
      expect(respuesta.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
      expect(respuesta.headers['retry-after']).toBeDefined();
    });
  });

  describe('CA-02: un Cliente en las rutas del Vendedor', () => {
    it('GET /usuarios y POST /codigo-recuperacion → 403, ACCESO_DENEGADO y nada cambia', async () => {
      const { idMaria } = await preparar();
      const maria = await sesionMaria();

      const lista = await conToken(
        http().get('/api/v1/usuarios'),
        maria.tokenAcceso,
      ).expect(403);
      expect(lista.body).toEqual(NO_AUTORIZADO);
      const codigo = await generarCodigo(maria.tokenAcceso, idMaria).expect(
        403,
      );
      expect(codigo.body).toEqual(NO_AUTORIZADO);

      expect(await contar('codigos_recuperacion')).toBe(0);
      const denegados = await auditoria('ACCESO_DENEGADO');
      expect(denegados.map((d) => d.detalle)).toEqual([
        { metodo: 'GET', ruta: '/api/v1/usuarios', rolUsuario: 'CLIENTE' },
        {
          metodo: 'POST',
          ruta: `/api/v1/usuarios/${idMaria}/codigo-recuperacion`,
          rolUsuario: 'CLIENTE',
        },
      ]);
      expect(await auditoria('CODIGO_RECUPERACION_GENERADO')).toHaveLength(0);
    });

    it('sin sesión → 401', async () => {
      await http().get('/api/v1/usuarios').expect(401);
      await http()
        .post(
          '/api/v1/usuarios/7d4f8c1e-0000-4000-8000-000000000000/codigo-recuperacion',
        )
        .expect(401);
      await http()
        .post('/api/v1/usuarios/yo/clave')
        .send({ claveActual: CLAVE, claveNueva: CLAVE_NUEVA })
        .expect(401);
    });
  });

  describe('GET /api/v1/usuarios (sección «Clientes»)', () => {
    it('solo Clientes, del más reciente al más antiguo, con codigoRecuperacionVigenteHasta y sin datos sensibles', async () => {
      const { vendedor, idMaria } = await preparar();
      const idJose = await registrar('José Peña', CORREO_JOSE, '0997654321');
      const { venceEn } = await codigoPara(vendedor, idMaria);

      const respuesta = await conToken(
        http().get('/api/v1/usuarios'),
        vendedor.tokenAcceso,
      ).expect(200);

      expect(respuesta.body).toMatchObject({
        pagina: 1,
        tamanio: 20,
        total: 2,
      });
      const elementos = respuesta.body.elementos as Record<string, unknown>[];
      expect(elementos.map((e) => e.id)).toEqual([idJose, idMaria]);
      expect(Object.keys(elementos[1]).toSorted()).toEqual([
        'activo',
        'codigoRecuperacionVigenteHasta',
        'correo',
        'creadoEn',
        'id',
        'nombre',
        'telefono',
      ]);
      expect(elementos[1]).toMatchObject({
        nombre: 'María Zambrano',
        correo: CORREO_MARIA,
        telefono: '+593991234567',
        activo: true,
        codigoRecuperacionVigenteHasta: venceEn,
      });
      expect(elementos[0].codigoRecuperacionVigenteHasta).toBeNull();
      expect(JSON.stringify(respuesta.body)).not.toMatch(/hash|\$2b\$/);
    });

    it('busca sin mayúsculas ni tildes en nombre, correo y teléfono, y pagina', async () => {
      const { vendedor, idMaria } = await preparar();
      const idJose = await registrar('José Peña', CORREO_JOSE, '0997654321');
      const buscar = (consulta: Record<string, string>) =>
        conToken(http().get('/api/v1/usuarios'), vendedor.tokenAcceso)
          .query(consulta)
          .expect(200);
      expect(ids((await buscar({ busqueda: 'MARIA' })).body)).toEqual([
        idMaria,
      ]);
      expect(ids((await buscar({ busqueda: 'pena' })).body)).toEqual([idJose]);
      expect(ids((await buscar({ busqueda: 'PEÑA' })).body)).toEqual([idJose]);
      expect(ids((await buscar({ busqueda: 'josé peña' })).body)).toEqual([
        idJose,
      ]);
      expect(ids((await buscar({ busqueda: 'JOSE.PENA@' })).body)).toEqual([
        idJose,
      ]);
      expect(ids((await buscar({ busqueda: '0991234' })).body)).toEqual([
        idMaria,
      ]);
      expect(ids((await buscar({ busqueda: '+593997' })).body)).toEqual([
        idJose,
      ]);
      expect(ids((await buscar({ busqueda: '%' })).body)).toEqual([]);

      const pagina2 = (await buscar({ pagina: '2', tamanio: '1' })).body;
      expect(pagina2).toMatchObject({ pagina: 2, tamanio: 1, total: 2 });
      expect(ids(pagina2)).toEqual([idMaria]);
    });

    it('RNF-03: búsqueda vacía o de más de 100 caracteres, o un parámetro no declarado → 400', async () => {
      const { vendedor } = await preparar();
      for (const consulta of [
        { busqueda: '' },
        { busqueda: 'a'.repeat(101) },
        { rol: 'VENDEDOR' },
        { tamanio: '101' },
      ]) {
        const respuesta = await conToken(
          http().get('/api/v1/usuarios'),
          vendedor.tokenAcceso,
        )
          .query(consulta)
          .expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      }
    });
  });

  describe('POST /api/v1/usuarios/yo/clave', () => {
    it('RF-USU-05: clave actual correcta → 204, la sesión actual sigue y las demás se revocan', async () => {
      const { idMaria } = await preparar();
      const actual = await sesionMaria();
      const otra = await sesionMaria();

      await cambiarClave(actual.tokenAcceso, {
        claveActual: CLAVE,
        claveNueva: CLAVE_NUEVA,
        tokenRenovacionActual: actual.tokenRenovacion,
      }).expect(204);

      await renovar(actual.tokenRenovacion).expect(200);
      await renovar(otra.tokenRenovacion).expect(401);
      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(401);
      reiniciarLimite();
      await ingresar('cliente', CORREO_MARIA, CLAVE_NUEVA).expect(200);

      const [cambiada] = await auditoria('CLAVE_CAMBIADA');
      expect(cambiada).toMatchObject({
        id_usuario: idMaria,
        entidad: 'USUARIO',
        id_entidad: idMaria,
        detalle: { sesionesRevocadas: 1 },
      });
      expect(JSON.stringify(cambiada)).not.toContain(CLAVE_NUEVA);
    });

    it('sin tokenRenovacionActual se revocan todas las sesiones; también funciona para el Vendedor', async () => {
      const { vendedor } = await preparar();

      await cambiarClave(vendedor.tokenAcceso, {
        claveActual: CLAVE_VENDEDOR,
        claveNueva: CLAVE_NUEVA,
      }).expect(204);

      await renovar(vendedor.tokenRenovacion).expect(401);
      await ingresar('vendedor', CORREO_VENDEDOR, CLAVE_NUEVA).expect(200);
      expect((await auditoria('CLAVE_CAMBIADA'))[0].detalle).toEqual({
        sesionesRevocadas: 1,
      });
    });

    it('RF-USU-05: clave actual incorrecta → 422; nueva igual a la actual → 400; nada cambia', async () => {
      await preparar();
      const maria = await sesionMaria();

      const incorrecta = await cambiarClave(maria.tokenAcceso, {
        claveActual: 'Incorrecta2026',
        claveNueva: CLAVE_NUEVA,
      }).expect(422);
      expect(incorrecta.body).toEqual({
        codigo: 'CLAVE_ACTUAL_INCORRECTA',
        mensaje: 'La clave actual no es correcta.',
        detalles: {},
      });

      const igual = await cambiarClave(maria.tokenAcceso, {
        claveActual: CLAVE,
        claveNueva: CLAVE,
      }).expect(400);
      expect(igual.body).toMatchObject({
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'La clave nueva debe ser distinta de la actual.',
        detalles: { errores: [{ campo: 'claveNueva' }] },
      });

      const debil = await cambiarClave(maria.tokenAcceso, {
        claveActual: CLAVE,
        claveNueva: 'corta1',
      }).expect(400);
      expect(debil.body.codigo).toBe('DATOS_INVALIDOS');

      await renovar(maria.tokenRenovacion).expect(200);
      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(200);
      expect(await auditoria('CLAVE_CAMBIADA')).toHaveLength(0);
    });

    it('D-17: el sexto cambio de clave en un minuto → 429', async () => {
      await preparar();
      const maria = await sesionMaria();
      for (let i = 0; i < 5; i++) {
        await cambiarClave(maria.tokenAcceso, {
          claveActual: 'Incorrecta2026',
          claveNueva: CLAVE_NUEVA,
        }).expect(422);
      }
      const respuesta = await cambiarClave(maria.tokenAcceso, {
        claveActual: 'Incorrecta2026',
        claveNueva: CLAVE_NUEVA,
      }).expect(429);
      expect(respuesta.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
    });
  });

  describe('Comando restablecer-clave-vendedor (D-35)', () => {
    it('cambia la clave del Vendedor, revoca sus sesiones y registra CLAVE_RESTABLECIDA COMANDO_SERVIDOR', async () => {
      const { vendedor } = await preparar();
      const maria = await sesionMaria();

      const resultado = await contexto.app
        .get(RestablecerClaveVendedorCasoUso)
        .ejecutar(CLAVE_NUEVA);

      expect(resultado).toEqual({
        idUsuario: vendedor.usuario.id,
        sesionesRevocadas: 1,
      });
      await renovar(vendedor.tokenRenovacion).expect(401);
      await renovar(maria.tokenRenovacion).expect(200);
      await ingresar('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR).expect(401);
      await ingresar('vendedor', CORREO_VENDEDOR, CLAVE_NUEVA).expect(200);

      const [restablecida] = await auditoria('CLAVE_RESTABLECIDA');
      expect(restablecida).toMatchObject({
        id_usuario: vendedor.usuario.id,
        id_entidad: vendedor.usuario.id,
        detalle: { origen: 'COMANDO_SERVIDOR', sesionesRevocadas: 1 },
      });
    });

    it('sin Vendedor falla y sugiere crear-vendedor', async () => {
      await expect(
        contexto.app.get(RestablecerClaveVendedorCasoUso).ejecutar(CLAVE_NUEVA),
      ).rejects.toThrow('npm run crear-vendedor');
      expect(await auditoria('CLAVE_RESTABLECIDA')).toHaveLength(0);
    });
  });
});
