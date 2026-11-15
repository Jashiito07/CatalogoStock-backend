import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import {
  type AlmacenLimiteReiniciable,
  type AppPruebas,
  crearAppPruebas,
} from './preparacion/app-pruebas.js';

/**
 * e2e de la verificación del correo y la recuperación por correo (contrato de
 * correo, RF-USU-05, D-50, «Pruebas mínimas») contra `catalogostock_pruebas`
 * (D-23). El transporte de correo es un doble en memoria: **ningún correo
 * real se envía**. Datos ficticios.
 */

const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_NUEVA = 'NuevaClave2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const CORREO_MARIA = 'maria.zambrano@ejemplo.test';
const CORREO_JOSE = 'jose.pena@ejemplo.test';

const MENSAJE_VERIFICACION =
  'El código no es válido o ya venció. Pide uno nuevo.';
const CODIGO_INVALIDO_RECUPERACION = {
  codigo: 'CODIGO_INVALIDO',
  mensaje: 'El código no es válido o ya venció. Pide uno nuevo a tu vendedor.',
  detalles: {},
};

interface CuerpoSesion {
  tokenAcceso: string;
  tokenRenovacion: string;
  usuario: { id: string; rol: string; correoVerificadoEn: string | null };
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

describe('Correo (e2e): verificación del correo y recuperación por correo', () => {
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

  const pedirVerificacion = (token: string) =>
    conToken(http().post('/api/v1/usuarios/yo/correo/verificacion'), token);

  const confirmarCorreo = (token: string, codigo: string) =>
    conToken(
      http().post('/api/v1/usuarios/yo/correo/confirmacion'),
      token,
    ).send({ codigo });

  const solicitarRecuperacion = (correo: string) =>
    http().post('/api/v1/autenticacion/recuperacion/solicitud').send({ correo });

  const recuperar = (correo: string, codigo: string, claveNueva = CLAVE_NUEVA) =>
    http()
      .post('/api/v1/autenticacion/recuperacion')
      .send({ correo, codigo, claveNueva });

  const renovar = (tokenRenovacion: string) =>
    http().post('/api/v1/autenticacion/renovacion').send({ tokenRenovacion });

  /** Reinicia el límite de intentos por IP sin vaciar las tablas. */
  function reiniciarLimite(): void {
    contexto.app.get<AlmacenLimiteReiniciable>(getStorageToken()).reiniciar();
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

  async function sesion(
    canal: 'cliente' | 'vendedor',
    correo: string,
    clave = CLAVE,
  ): Promise<CuerpoSesion> {
    const respuesta = await ingresar(canal, correo, clave).expect(200);
    return respuesta.body as CuerpoSesion;
  }

  async function crearVendedor(): Promise<void> {
    const resultado = await contexto.app.get(CrearVendedorCasoUso).ejecutar({
      nombre: 'Vendedor de Prueba',
      correo: CORREO_VENDEDOR,
      telefono: '0987654321',
      clave: CLAVE_VENDEDOR,
    });
    if (!resultado.creado) {
      throw new Error('No se creó el Vendedor de prueba');
    }
  }

  /** María registrada, con sesión, y el correo sin verificar. */
  async function maria(): Promise<{ id: string; sesion: CuerpoSesion }> {
    const id = await registrar(
      'María Zambrano',
      'Maria.Zambrano@Ejemplo.test',
      '0991234567',
    );
    return { id, sesion: await sesion('cliente', CORREO_MARIA) };
  }

  /** Pide el código, lo confirma y deja el correo verificado. */
  async function verificar(token: string, correo: string): Promise<void> {
    await pedirVerificacion(token).expect(204);
    await confirmarCorreo(token, contexto.correo.ultimoCodigo(correo)).expect(
      204,
    );
  }

  async function auditoria(accion: string): Promise<FilaAuditoria[]> {
    return contexto.fuente.query<FilaAuditoria[]>(
      `SELECT accion, id_usuario, id_entidad, entidad, detalle FROM auditoria
       WHERE accion = $1 ORDER BY fecha, id`,
      [accion],
    );
  }

  async function contarCodigos(proposito?: string): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM codigos_recuperacion
       WHERE ($1::text IS NULL OR proposito::text = $1)`,
      [proposito ?? null],
    );
    return Number(total);
  }

  async function correoVerificadoEn(id: string): Promise<Date | null> {
    const [fila] = await contexto.fuente.query<
      { correo_verificado_en: Date | null }[]
    >('SELECT correo_verificado_en FROM usuarios WHERE id = $1', [id]);
    return fila.correo_verificado_en;
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

  describe('POST /usuarios/yo/correo/verificacion y /confirmacion', () => {
    it('RF-USU-05: pedir el código y confirmarlo → correo_verificado_en se llena y queda CORREO_VERIFICADO', async () => {
      const { id, sesion: s } = await maria();
      expect(s.usuario.correoVerificadoEn).toBeNull();

      const pedido = await pedirVerificacion(s.tokenAcceso).expect(204);
      expect(pedido.text).toBe('');
      expect(contexto.correo.enviados).toHaveLength(1);
      const [correo] = contexto.correo.enviados;
      expect(correo.para).toBe(CORREO_MARIA);
      expect(correo.asunto).toBe('Tu código de CatálogoStock');
      expect(correo.texto).toContain('15 minutos');
      expect(await contarCodigos('VERIFICACION_CORREO')).toBe(1);
      expect(await correoVerificadoEn(id)).toBeNull();

      const confirmado = await confirmarCorreo(
        s.tokenAcceso,
        contexto.correo.ultimoCodigo(),
      ).expect(204);
      expect(confirmado.text).toBe('');

      expect(await correoVerificadoEn(id)).not.toBeNull();
      const [verificado] = await auditoria('CORREO_VERIFICADO');
      expect(verificado).toMatchObject({
        id_usuario: id,
        entidad: 'USUARIO',
        id_entidad: id,
      });
      const yo = await conToken(
        http().get('/api/v1/usuarios/yo'),
        s.tokenAcceso,
      ).expect(200);
      expect(yo.body.correoVerificadoEn).toEqual(expect.any(String));
    });

    it('409 CORREO_YA_VERIFICADO si el correo ya está verificado; no se envía otro código', async () => {
      const { sesion: s } = await maria();
      await verificar(s.tokenAcceso, CORREO_MARIA);

      const respuesta = await pedirVerificacion(s.tokenAcceso).expect(409);

      expect(respuesta.body.codigo).toBe('CORREO_YA_VERIFICADO');
      expect(contexto.correo.enviados).toHaveLength(1);
    });

    it('RF-USU-05: código incorrecto, vencido o reutilizado → el mismo 422 CODIGO_INVALIDO', async () => {
      const { id, sesion: s } = await maria();
      await pedirVerificacion(s.tokenAcceso).expect(204);
      const codigo = contexto.correo.ultimoCodigo();
      const otro = codigo === '000000' ? '000001' : '000000';

      const incorrecto = await confirmarCorreo(s.tokenAcceso, otro).expect(422);
      expect(incorrecto.body).toEqual({
        codigo: 'CODIGO_INVALIDO',
        mensaje: MENSAJE_VERIFICACION,
        detalles: {},
      });
      // Vencido.
      await contexto.fuente.query(
        `UPDATE codigos_recuperacion
         SET fecha_creacion = now() - interval '20 minutes',
             fecha_vencimiento = now() - interval '5 minutes'
         WHERE id_usuario = $1`,
        [id],
      );
      expect(
        (await confirmarCorreo(s.tokenAcceso, codigo).expect(422)).body,
      ).toEqual(incorrecto.body);
      expect(await correoVerificadoEn(id)).toBeNull();

      // Reutilizado: tras usarlo, el mismo código ya no sirve.
      await pedirVerificacion(s.tokenAcceso).expect(204);
      const vigente = contexto.correo.ultimoCodigo();
      await confirmarCorreo(s.tokenAcceso, vigente).expect(204);
      expect(
        (await confirmarCorreo(s.tokenAcceso, vigente).expect(422)).body,
      ).toEqual(incorrecto.body);
    });

    it('RF-USU-05: el quinto intento fallido invalida el código aunque luego se envíe el correcto', async () => {
      const { id, sesion: s } = await maria();
      await pedirVerificacion(s.tokenAcceso).expect(204);
      const codigo = contexto.correo.ultimoCodigo();
      const otro = codigo === '999999' ? '999998' : '999999';

      for (let i = 0; i < 5; i++) {
        await confirmarCorreo(s.tokenAcceso, otro).expect(422);
      }
      reiniciarLimite(); // el límite por IP es otro: aquí se prueba el del código
      await confirmarCorreo(s.tokenAcceso, codigo).expect(422);

      expect(await correoVerificadoEn(id)).toBeNull();
      const [fila] = await contexto.fuente.query<
        { intentos_fallidos: number; fecha_invalidacion: Date | null }[]
      >(
        `SELECT intentos_fallidos, fecha_invalidacion FROM codigos_recuperacion
         WHERE id_usuario = $1`,
        [id],
      );
      expect(fila.intentos_fallidos).toBe(5);
      expect(fila.fecha_invalidacion).not.toBeNull();
    });

    it('propiedad: el código de una cuenta no verifica el correo de otra', async () => {
      const { sesion: sMaria } = await maria();
      const idJose = await registrar('José Peña', CORREO_JOSE, '0997654321');
      const sJose = await sesion('cliente', CORREO_JOSE);
      await pedirVerificacion(sMaria.tokenAcceso).expect(204);
      const codigoDeMaria = contexto.correo.ultimoCodigo(CORREO_MARIA);

      await confirmarCorreo(sJose.tokenAcceso, codigoDeMaria).expect(422);

      expect(await correoVerificadoEn(idJose)).toBeNull();
    });

    it('D-17: el cuarto envío de verificación en una hora → 429 DEMASIADAS_SOLICITUDES y no se envía más', async () => {
      const { sesion: s } = await maria();
      for (let i = 0; i < 3; i++) {
        await pedirVerificacion(s.tokenAcceso).expect(204);
      }

      const respuesta = await pedirVerificacion(s.tokenAcceso).expect(429);

      expect(respuesta.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
      expect(
        respuesta.body.detalles.reintentarEnSegundos,
      ).toBeGreaterThan(3500);
      expect(contexto.correo.enviados).toHaveLength(3);
      expect(await contarCodigos('VERIFICACION_CORREO')).toBe(3);
    });

    it('Robustez: si el servicio de correo falla → 503 CORREO_NO_DISPONIBLE sin detalles, no queda nada y se puede reintentar', async () => {
      const { sesion: s } = await maria();
      contexto.correo.fallar = true;

      const respuesta = await pedirVerificacion(s.tokenAcceso).expect(503);

      expect(respuesta.body).toEqual({
        codigo: 'CORREO_NO_DISPONIBLE',
        mensaje:
          'El servicio de correo no está disponible. Inténtalo de nuevo en unos minutos.',
        detalles: {},
      });
      expect(await contarCodigos()).toBe(0);
      expect(await auditoria('CODIGO_CORREO_ENVIADO')).toHaveLength(0);

      contexto.correo.fallar = false;
      // Fallar tres veces no gasta el límite de 3 por hora.
      await pedirVerificacion(s.tokenAcceso).expect(204);
      expect(contexto.correo.enviados).toHaveLength(1);
    });

    it('RNF-03: formato inválido → 400; sin sesión → 401', async () => {
      const { sesion: s } = await maria();
      for (const codigo of ['12345', '12ab56', '']) {
        const respuesta = await confirmarCorreo(s.tokenAcceso, codigo).expect(
          400,
        );
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      }
      await http().post('/api/v1/usuarios/yo/correo/verificacion').expect(401);
      await http()
        .post('/api/v1/usuarios/yo/correo/confirmacion')
        .send({ codigo: '123456' })
        .expect(401);
    });
  });

  describe('POST /autenticacion/recuperacion/solicitud', () => {
    it('Seguridad: correo inexistente, sin verificar o inactivo → 204 con la misma respuesta y no se envía nada', async () => {
      const { id, sesion: s } = await maria();
      const idJose = await registrar('José Peña', CORREO_JOSE, '0997654321');
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();
      await contexto.fuente.query(
        'UPDATE usuarios SET activo = false WHERE id = $1',
        [id],
      );
      const codigosAntes = await contarCodigos();

      const respuestas = [
        await solicitarRecuperacion('nadie@ejemplo.test').expect(204), // no existe
        await solicitarRecuperacion(CORREO_JOSE).expect(204), // sin verificar
        await solicitarRecuperacion(CORREO_MARIA).expect(204), // inactiva
      ];

      for (const respuesta of respuestas) {
        expect(respuesta.text).toBe('');
        expect(respuesta.body).toEqual({});
      }
      expect(new Set(respuestas.map((r) => r.status))).toEqual(new Set([204]));
      expect(contexto.correo.enviados).toHaveLength(0);
      expect(await contarCodigos()).toBe(codigosAntes);
      const ignoradas = await auditoria('SOLICITUD_RECUPERACION_IGNORADA');
      expect(ignoradas.map((f) => f.detalle)).toEqual([
        { correo: 'nadie@ejemplo.test', motivo: 'NO_EXISTE' },
        { correo: CORREO_JOSE, motivo: 'CORREO_NO_VERIFICADO' },
        { correo: CORREO_MARIA, motivo: 'CUENTA_INACTIVA' },
      ]);
      expect(ignoradas[0].id_usuario).toBeNull();
      expect(ignoradas[1].id_usuario).toBe(idJose);
      expect(ignoradas[2].id_usuario).toBe(id);
    });

    it('Seguridad: cuenta válida → 204 y se envía un solo correo, al correo registrado (aunque se escriba en mayúsculas)', async () => {
      const { id, sesion: s } = await maria();
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();

      const respuesta = await solicitarRecuperacion(
        ` ${CORREO_MARIA.toUpperCase()} `,
      ).expect(204);

      expect(respuesta.text).toBe('');
      expect(contexto.correo.enviados).toHaveLength(1);
      expect(contexto.correo.enviados[0].para).toBe(CORREO_MARIA);
      expect(await contarCodigos('RECUPERACION_CORREO')).toBe(1);
      const enviado = (await auditoria('CODIGO_CORREO_ENVIADO')).at(-1);
      expect(enviado?.detalle).toMatchObject({
        correo: CORREO_MARIA,
        proposito: 'RECUPERACION_CORREO',
      });
      expect(enviado?.id_usuario).toBe(id);
    });

    it('RF-USU-05: el código enviado restablece la clave y revoca sesiones; reusarlo → 422; el código no queda en la base ni en la bitácora', async () => {
      const { id, sesion: s } = await maria();
      const otraSesion = await sesion('cliente', CORREO_MARIA);
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();
      await solicitarRecuperacion(CORREO_MARIA).expect(204);
      const codigo = contexto.correo.ultimoCodigo();

      await recuperar(CORREO_MARIA, codigo).expect(204);

      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(401);
      await ingresar('cliente', CORREO_MARIA, CLAVE_NUEVA).expect(200);
      await renovar(s.tokenRenovacion).expect(401);
      await renovar(otraSesion.tokenRenovacion).expect(401);
      reiniciarLimite();
      expect(
        (await recuperar(CORREO_MARIA, codigo, 'OtraClave2026').expect(422))
          .body,
      ).toEqual(CODIGO_INVALIDO_RECUPERACION);

      const [restablecida] = await auditoria('CLAVE_RESTABLECIDA');
      expect(restablecida).toMatchObject({
        id_usuario: id,
        detalle: { origen: 'CODIGO_CORREO', sesionesRevocadas: 2 },
      });
      const [fila] = await contexto.fuente.query<
        { hash_codigo: string; generado_por: string | null }[]
      >(
        `SELECT hash_codigo, generado_por FROM codigos_recuperacion
         WHERE proposito = 'RECUPERACION_CORREO'`,
      );
      expect(fila.hash_codigo).toMatch(/^[0-9a-f]{64}$/);
      expect(fila.generado_por).toBeNull();
      const bitacora = JSON.stringify(
        await contexto.fuente.query('SELECT * FROM auditoria'),
      );
      expect(bitacora).not.toContain(`"${codigo}"`);
      expect(bitacora).not.toContain(CLAVE_NUEVA);
      expect(bitacora).not.toContain(fila.hash_codigo);
    });

    it('RF-USU-05: código de correo incorrecto o vencido → el mismo 422', async () => {
      const { id, sesion: s } = await maria();
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();
      await solicitarRecuperacion(CORREO_MARIA).expect(204);
      const codigo = contexto.correo.ultimoCodigo();
      const otro = codigo === '000000' ? '000001' : '000000';

      expect(
        (await recuperar(CORREO_MARIA, otro).expect(422)).body,
      ).toEqual(CODIGO_INVALIDO_RECUPERACION);
      await contexto.fuente.query(
        `UPDATE codigos_recuperacion
         SET fecha_creacion = now() - interval '20 minutes',
             fecha_vencimiento = now() - interval '5 minutes'
         WHERE id_usuario = $1 AND proposito = 'RECUPERACION_CORREO'`,
        [id],
      );
      expect(
        (await recuperar(CORREO_MARIA, codigo).expect(422)).body,
      ).toEqual(CODIGO_INVALIDO_RECUPERACION);
      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(200);
    });

    it('RF-USU-05: el quinto intento fallido invalida el código de correo aunque luego se envíe el correcto', async () => {
      const { sesion: s } = await maria();
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();
      await solicitarRecuperacion(CORREO_MARIA).expect(204);
      const codigo = contexto.correo.ultimoCodigo();
      const otro = codigo === '999999' ? '999998' : '999999';

      for (let i = 0; i < 5; i++) {
        await recuperar(CORREO_MARIA, otro).expect(422);
      }
      reiniciarLimite();
      await recuperar(CORREO_MARIA, codigo).expect(422);

      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(200);
    });

    it('D-17: el 4.º envío en una hora para la misma cuenta → sigue 204, no se envía más y se registra', async () => {
      const { id, sesion: s } = await maria();
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();

      for (let i = 0; i < 3; i++) {
        await solicitarRecuperacion(CORREO_MARIA).expect(204);
      }
      reiniciarLimite(); // el límite por IP es otro: aquí se prueba el de la cuenta
      const cuarto = await solicitarRecuperacion(CORREO_MARIA).expect(204);

      expect(cuarto.text).toBe('');
      expect(contexto.correo.enviados).toHaveLength(3);
      const [limite] = await auditoria('SOLICITUD_RECUPERACION_IGNORADA');
      expect(limite).toMatchObject({
        id_usuario: id,
        detalle: { correo: CORREO_MARIA, motivo: 'LIMITE_HORARIO' },
      });
    });

    it('D-17: la cuarta solicitud en un minuto desde la misma IP → 429', async () => {
      for (let i = 0; i < 3; i++) {
        await solicitarRecuperacion('nadie@ejemplo.test').expect(204);
      }
      const respuesta = await solicitarRecuperacion('nadie@ejemplo.test').expect(
        429,
      );
      expect(respuesta.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
      expect(respuesta.headers['retry-after']).toBeDefined();
    });

    it('Robustez: si el servicio de correo falla, la solicitud pública sigue en 204 sin filtrar detalles', async () => {
      const { sesion: s } = await maria();
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();
      contexto.correo.fallar = true;

      const respuesta = await solicitarRecuperacion(CORREO_MARIA).expect(204);

      expect(respuesta.text).toBe('');
      expect(contexto.correo.enviados).toHaveLength(0);
    });

    it('RNF-03: formato inválido → 400 sin repetir el valor', async () => {
      const respuesta = await solicitarRecuperacion('sin-arroba').expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      expect(JSON.stringify(respuesta.body)).not.toContain('sin-arroba');
      expect(contexto.correo.enviados).toHaveLength(0);
    });

    it('RF-USU-05: el Vendedor recupera su propia clave con el código enviado a su correo verificado', async () => {
      await crearVendedor();
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
      await verificar(vendedor.tokenAcceso, CORREO_VENDEDOR);
      contexto.correo.reiniciar();
      await solicitarRecuperacion(CORREO_VENDEDOR).expect(204);
      const codigo = contexto.correo.ultimoCodigo(CORREO_VENDEDOR);

      await recuperar(CORREO_VENDEDOR, codigo).expect(204);

      await ingresar('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR).expect(401);
      await ingresar('vendedor', CORREO_VENDEDOR, CLAVE_NUEVA).expect(200);
      await renovar(vendedor.tokenRenovacion).expect(401);
    });

    it('RF-USU-05 (respaldo): el Vendedor sigue sin poder usar la recuperación asistida (sin código de correo → 422)', async () => {
      await crearVendedor();

      const respuesta = await recuperar(CORREO_VENDEDOR, '123456').expect(422);

      expect(respuesta.body).toEqual(CODIGO_INVALIDO_RECUPERACION);
      const [fallida] = await auditoria('RECUPERACION_FALLIDA');
      expect(fallida.detalle).toEqual({
        correo: CORREO_VENDEDOR,
        motivo: 'NO_CLIENTE',
      });
    });

    it('RF-USU-05 (respaldo): un código del Vendedor reemplaza al enviado por correo y el asistido sigue funcionando', async () => {
      await crearVendedor();
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
      const { id, sesion: s } = await maria();
      await verificar(s.tokenAcceso, CORREO_MARIA);
      contexto.correo.reiniciar();
      await solicitarRecuperacion(CORREO_MARIA).expect(204);
      const porCorreo = contexto.correo.ultimoCodigo();

      const asistido = await conToken(
        http().post(`/api/v1/usuarios/${id}/codigo-recuperacion`),
        vendedor.tokenAcceso,
      ).expect(201);
      const codigoAsistido = (asistido.body as { codigo: string }).codigo;

      if (codigoAsistido !== porCorreo) {
        await recuperar(CORREO_MARIA, porCorreo).expect(422);
      }
      await recuperar(CORREO_MARIA, codigoAsistido).expect(204);
      const [restablecida] = await auditoria('CLAVE_RESTABLECIDA');
      expect(restablecida.detalle).toMatchObject({ origen: 'CODIGO_VENDEDOR' });
    });
  });
});
