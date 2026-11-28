import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import {
  type LineaSintetica,
  crearPdfSintetico,
} from '../src/modulos/importacion/infraestructura/pdf/pdf-sintetico.prueba-spec.js';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import {
  type AlmacenLimiteReiniciable,
  type AppPruebas,
  crearAppPruebas,
} from './preparacion/app-pruebas.js';
import { PNG_PRUEBA } from './preparacion/imagenes-prueba.js';

/**
 * e2e del contrato cuenta-y-politicas (RF-USU-06, RF-USU-07, RF-USU-08, D-60,
 * PA-21, D-20, «Pruebas mínimas») contra `catalogostock_pruebas` (D-23). El
 * correo es un doble en memoria (ningún correo real). Datos ficticios.
 */

const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.cuenta@ejemplo.test';
const CORREO_SEGUNDO = 'segundo.vendedor@ejemplo.test';
const CORREO_MARIA = 'maria.zambrano@ejemplo.test';
const CORREO_JOSE = 'jose.pena@ejemplo.test';
const TELEFONO_MARIA = '0991234567';
const TELEFONO_MARIA_E164 = '+593991234567';
const WHATSAPP_VENDEDOR = '0987000111';
const WHATSAPP_E164 = '+593987000111';
const URL_PUBLICA = 'https://catalogostock.ejemplo.test';
const RAIZ_ALMACENAMIENTO = resolve(process.env.RUTA_ALMACENAMIENTO ?? '');
/** PNG real: desde D-62 el servidor decodifica cada imagen subida. */
const PNG = PNG_PRUEBA;

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

interface FilaAuditoria {
  accion: string;
  id_usuario: string | null;
  entidad: string | null;
  id_entidad: string | null;
  detalle: Record<string, unknown>;
}

function conToken<T extends { set(c: string, v: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

const nombres = (r: { body: unknown }) =>
  (r.body as { elementos: Array<{ nombre: string }> }).elementos.map((p) => p.nombre);

function catalogo(): Buffer {
  const lineas: LineaSintetica[] = [
    { texto: 'Crema Hidratante Mani', x: 50, y: 100 },
    { texto: 'OFERTA US$ 35.00', x: 50, y: 112 },
    { texto: 'CÓD. 43873', x: 50, y: 124 },
    { texto: 'Pág. 3', x: 50, y: 134 },
  ];
  return crearPdfSintetico([lineas]);
}

describe('Cuenta, políticas, perfil y dueño del producto (e2e)', () => {
  let contexto: AppPruebas;

  const http = () => request(contexto.app.getHttpServer());

  const eliminar = (token: string, cuerpo: unknown) =>
    conToken(http().post('/api/v1/usuarios/yo/eliminacion'), token).send(cuerpo as object);
  const solicitar = (correo: unknown) =>
    http().post('/api/v1/autenticacion/eliminacion/solicitud').send({ correo: correo as string });
  const confirmar = (correo: string, codigo: string) =>
    http().post('/api/v1/autenticacion/eliminacion').send({ correo, codigo });

  const reiniciarLimite = () =>
    contexto.app.get<AlmacenLimiteReiniciable>(getStorageToken()).reiniciar();

  const ingresar = (canal: 'cliente' | 'vendedor', correo: string, clave: string) =>
    http().post(`/api/v1/autenticacion/ingreso/${canal}`).send({ correo, clave });

  const sesion = async (
    canal: 'cliente' | 'vendedor',
    correo: string,
    clave = CLAVE,
  ): Promise<CuerpoSesion> => {
    reiniciarLimite();
    return (await ingresar(canal, correo, clave).expect(200)).body as CuerpoSesion;
  };

  async function registrar(nombre: string, correo: string, telefono: string): Promise<string> {
    reiniciarLimite();
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

  /** Cliente con el correo ya verificado y con sesión. */
  async function clienteVerificado(
    nombre = 'María Zambrano',
    correo = CORREO_MARIA,
    telefono = TELEFONO_MARIA,
  ): Promise<{ id: string; sesion: CuerpoSesion }> {
    const id = await registrar(nombre, correo, telefono);
    const s = await sesion('cliente', correo);
    await conToken(http().post('/api/v1/usuarios/yo/correo/verificacion'), s.tokenAcceso).expect(204);
    await conToken(http().post('/api/v1/usuarios/yo/correo/confirmacion'), s.tokenAcceso)
      .send({ codigo: contexto.correo.ultimoCodigo(correo) })
      .expect(204);
    contexto.correo.enviados.length = 0;
    return { id, sesion: s };
  }

  async function auditoria(accion: string): Promise<FilaAuditoria[]> {
    return contexto.fuente.query<FilaAuditoria[]>(
      `SELECT accion, id_usuario, entidad, id_entidad, detalle FROM auditoria
       WHERE accion = $1 ORDER BY fecha, id`,
      [accion],
    );
  }

  const fila = async (id: string) =>
    (
      await contexto.fuente.query<
        {
          nombre: string;
          correo: string;
          telefono: string;
          hash_clave: string;
          activo: boolean;
          eliminado_en: Date | null;
        }[]
      >(
        `SELECT nombre, correo, telefono, hash_clave, activo, eliminado_en FROM usuarios WHERE id = $1`,
        [id],
      )
    )[0];

  /**
   * No hay endpoint para crear un segundo Vendedor y la base solo admite uno
   * (D-21): en la base de pruebas se quita el índice, se inserta el segundo
   * directamente y, al terminar, se restituye el índice.
   */
  async function insertarSegundoVendedor(): Promise<void> {
    await contexto.fuente.query(`DROP INDEX IF EXISTS uq_usuarios_un_vendedor`);
    await contexto.fuente.query(
      `INSERT INTO usuarios (id, nombre, correo, telefono, hash_clave, rol)
       SELECT '00000000-0000-4000-8000-0000000000ab', 'Segundo Vendedor', $1, '+593981112223', hash_clave, 'VENDEDOR'
       FROM usuarios WHERE correo = $2`,
      [CORREO_SEGUNDO, CORREO_VENDEDOR],
    );
  }

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  beforeEach(async () => {
    await contexto.limpiar();
    await crearVendedor();
  });

  afterAll(async () => {
    await contexto?.cerrar();
    rmSync(RAIZ_ALMACENAMIENTO, { recursive: true, force: true });
  });

  describe('RF-USU-06: eliminar la cuenta desde la app (POST /usuarios/yo/eliminacion)', () => {
    it('clave correcta → 204; la fila queda anonimizada, inactiva, con eliminado_en, sin sesiones ni códigos; el correo y el teléfono se pueden volver a registrar', async () => {
      const { id, sesion: s } = await clienteVerificado();
      await conToken(http().post('/api/v1/usuarios/yo/correo/verificacion'), s.tokenAcceso).expect(409);
      // Un código pendiente de eliminación por la web también se borra.
      await http()
        .post('/api/v1/autenticacion/eliminacion/solicitud')
        .send({ correo: CORREO_MARIA })
        .expect(204);
      const antes = await fila(id);

      const respuesta = await eliminar(s.tokenAcceso, { clave: CLAVE }).expect(204);
      expect(respuesta.text).toBe('');

      const despues = await fila(id);
      expect(despues).toMatchObject({
        nombre: 'Cuenta eliminada',
        correo: `eliminada-${id}@eliminada.invalid`,
        activo: false,
      });
      expect(despues.telefono).toMatch(/^\+000\d{9}$/);
      expect(despues.eliminado_en).toBeInstanceOf(Date);
      expect(despues.hash_clave).not.toBe(antes.hash_clave);
      const [{ vigentes }] = await contexto.fuente.query<{ vigentes: string }[]>(
        `SELECT count(*) AS vigentes FROM sesiones WHERE id_usuario = $1 AND fecha_revocacion IS NULL`,
        [id],
      );
      expect(Number(vigentes)).toBe(0);
      const [{ codigos }] = await contexto.fuente.query<{ codigos: string }[]>(
        `SELECT count(*) AS codigos FROM codigos_recuperacion WHERE id_usuario = $1`,
        [id],
      );
      expect(Number(codigos)).toBe(0);

      // Mismo correo y teléfono: cuenta nueva.
      await registrar('María Nueva', CORREO_MARIA, TELEFONO_MARIA);
    });

    it('la bitácora guarda CUENTA_ELIMINADA con idUsuario y via, sin nombre, correo ni teléfono (D-20), y conserva las filas anteriores del usuario (PA-21)', async () => {
      const { id, sesion: s } = await clienteVerificado();
      const [{ antes }] = await contexto.fuente.query<{ antes: string }[]>(
        `SELECT count(*) AS antes FROM auditoria WHERE id_usuario = $1`,
        [id],
      );

      await eliminar(s.tokenAcceso, { clave: CLAVE }).expect(204);

      const filas = await auditoria('CUENTA_ELIMINADA');
      expect(filas).toEqual([
        {
          accion: 'CUENTA_ELIMINADA',
          id_usuario: id,
          entidad: 'USUARIO',
          id_entidad: id,
          detalle: { idUsuario: id, via: 'APP' },
        },
      ]);
      const texto = JSON.stringify(filas).toLowerCase();
      for (const dato of [CORREO_MARIA, 'zambrano', 'maría', TELEFONO_MARIA, TELEFONO_MARIA_E164]) {
        expect(texto).not.toContain(dato.toLowerCase());
      }
      const [{ despues }] = await contexto.fuente.query<{ despues: string }[]>(
        `SELECT count(*) AS despues FROM auditoria WHERE id_usuario = $1`,
        [id],
      );
      expect(Number(despues)).toBe(Number(antes) + 1);
    });

    it('clave incorrecta → 422 y la cuenta queda intacta; sin clave o con campos extra → 400; sin sesión → 401', async () => {
      const { id, sesion: s } = await clienteVerificado();

      const incorrecta = await eliminar(s.tokenAcceso, { clave: 'Otra2026clave' }).expect(422);
      expect(incorrecta.body).toMatchObject({ codigo: 'CLAVE_ACTUAL_INCORRECTA' });
      expect((await fila(id)).eliminado_en).toBeNull();
      expect((await fila(id)).correo).toBe(CORREO_MARIA);

      expect((await eliminar(s.tokenAcceso, {}).expect(400)).body.codigo).toBe('DATOS_INVALIDOS');
      expect(
        (await eliminar(s.tokenAcceso, { clave: CLAVE, rol: 'VENDEDOR' }).expect(400)).body.codigo,
      ).toBe('DATOS_INVALIDOS');
      await http().post('/api/v1/usuarios/yo/eliminacion').send({ clave: CLAVE }).expect(401);
      expect((await fila(id)).eliminado_en).toBeNull();
    });

    it('el Vendedor recibe 403 (queda ACCESO_DENEGADO) y no se elimina', async () => {
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
      const respuesta = await eliminar(vendedor.tokenAcceso, { clave: CLAVE_VENDEDOR }).expect(403);
      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      expect((await fila(vendedor.usuario.id)).eliminado_en).toBeNull();
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(1);
    });

    it('D-17: 3 intentos por hora y cuenta; el cuarto → 429 aunque la clave sea correcta y la cuenta sigue intacta', async () => {
      const { id, sesion: s } = await clienteVerificado();
      for (let i = 0; i < 3; i++) {
        await eliminar(s.tokenAcceso, { clave: 'Otra2026clave' }).expect(422);
      }
      const limite = await eliminar(s.tokenAcceso, { clave: CLAVE }).expect(429);
      expect(limite.body).toMatchObject({
        codigo: 'DEMASIADAS_SOLICITUDES',
        detalles: { reintentarEnSegundos: expect.any(Number) as number },
      });
      expect((await fila(id)).eliminado_en).toBeNull();
    });

    it('tras eliminar no puede ingresar (CORREO_NO_REGISTRADO), ni recuperar su clave, ni su token sirve en /usuarios/yo', async () => {
      const { sesion: s } = await clienteVerificado();
      await eliminar(s.tokenAcceso, { clave: CLAVE }).expect(204);
      reiniciarLimite();

      const ingreso = await ingresar('cliente', CORREO_MARIA, CLAVE).expect(401);
      expect(ingreso.body.codigo).toBe('CORREO_NO_REGISTRADO');
      await ingresar('vendedor', CORREO_MARIA, CLAVE).expect(401);

      await http()
        .post('/api/v1/autenticacion/recuperacion/solicitud')
        .send({ correo: CORREO_MARIA })
        .expect(204);
      expect(contexto.correo.enviados).toHaveLength(0);
      await http()
        .post('/api/v1/autenticacion/recuperacion')
        .send({ correo: CORREO_MARIA, codigo: '123456', claveNueva: 'NuevaClave2026' })
        .expect(422);
      await conToken(http().get('/api/v1/usuarios/yo'), s.tokenAcceso).expect(401);
      await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({ tokenRenovacion: s.tokenRenovacion })
        .expect(401);
    });

    it('la cuenta eliminada no aparece en la lista de clientes del Vendedor ni se puede reactivar', async () => {
      const { id, sesion: s } = await clienteVerificado();
      await clienteVerificado('José Peña', CORREO_JOSE, '0997654321');
      await eliminar(s.tokenAcceso, { clave: CLAVE }).expect(204);
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);

      const lista = await conToken(http().get('/api/v1/usuarios'), vendedor.tokenAcceso).expect(200);
      expect((lista.body as { total: number }).total).toBe(1);
      await conToken(http().patch(`/api/v1/usuarios/${id}/estado`), vendedor.tokenAcceso)
        .send({ activo: true })
        .expect(404);
      await conToken(http().post(`/api/v1/usuarios/${id}/codigo-recuperacion`), vendedor.tokenAcceso).expect(404);
      expect((await fila(id)).activo).toBe(false);
    });
  });

  describe('RF-USU-06: eliminar la cuenta desde la web (/autenticacion/eliminacion)', () => {
    it('con una cuenta válida llega un solo código al correo registrado y el código correcto → 204: elimina la cuenta (via WEB)', async () => {
      const { id } = await clienteVerificado();

      const pedido = await solicitar('  Maria.Zambrano@Ejemplo.TEST ').expect(204);
      expect(pedido.text).toBe('');
      expect(contexto.correo.enviados).toHaveLength(1);
      expect(contexto.correo.enviados[0].para).toBe(CORREO_MARIA);
      expect(contexto.correo.enviados[0].texto).toContain('eliminar tu cuenta');
      const [codigo] = await contexto.fuente.query<{ proposito: string; hash_codigo: string }[]>(
        `SELECT proposito, hash_codigo FROM codigos_recuperacion WHERE id_usuario = $1 AND proposito = 'ELIMINACION_CUENTA'`,
        [id],
      );
      expect(codigo.proposito).toBe('ELIMINACION_CUENTA');
      const enviado = contexto.correo.ultimoCodigo(CORREO_MARIA);
      expect(codigo.hash_codigo).not.toContain(enviado);
      expect((await auditoria('CODIGO_CORREO_ENVIADO')).at(-1)).toMatchObject({
        detalle: { proposito: 'ELIMINACION_CUENTA' },
      });
      expect(JSON.stringify(await auditoria('CODIGO_CORREO_ENVIADO'))).not.toContain(enviado);

      reiniciarLimite();
      await confirmar(CORREO_MARIA, enviado).expect(204);

      expect(await fila(id)).toMatchObject({
        nombre: 'Cuenta eliminada',
        activo: false,
      });
      expect((await auditoria('CUENTA_ELIMINADA'))[0].detalle).toEqual({ idUsuario: id, via: 'WEB' });
      // Reutilizar el código → 422.
      reiniciarLimite();
      await confirmar(CORREO_MARIA, enviado).expect(422);
    });

    it('correo inexistente, sin verificar o del Vendedor → 204 y no se envía nada (misma respuesta)', async () => {
      await registrar('Sin Verificar', CORREO_JOSE, '0997654321');
      contexto.correo.enviados.length = 0;

      for (const correo of ['nadie@ejemplo.test', CORREO_JOSE, CORREO_VENDEDOR]) {
        reiniciarLimite();
        const respuesta = await solicitar(correo).expect(204);
        expect(respuesta.text).toBe('');
      }
      expect(contexto.correo.enviados).toHaveLength(0);
      const ignoradas = await auditoria('SOLICITUD_RECUPERACION_IGNORADA');
      expect(ignoradas.map((f) => f.detalle.motivo)).toEqual([
        'NO_EXISTE',
        'CORREO_NO_VERIFICADO',
        'NO_ES_CLIENTE',
      ]);
    });

    it('un fallo del servicio de correo no cambia la respuesta pública (204)', async () => {
      await clienteVerificado();
      contexto.correo.fallar = true;
      await solicitar(CORREO_MARIA).expect(204);
    });

    it('código incorrecto, vencido o de otro propósito → 422 CODIGO_INVALIDO con mensaje único; la cuenta queda intacta', async () => {
      const { id } = await clienteVerificado();
      await solicitar(CORREO_MARIA).expect(204);
      const bueno = contexto.correo.ultimoCodigo(CORREO_MARIA);
      const malo = bueno === '000000' ? '111111' : '000000';

      reiniciarLimite();
      const incorrecto = await confirmar(CORREO_MARIA, malo).expect(422);
      expect(incorrecto.body).toEqual({
        codigo: 'CODIGO_INVALIDO',
        mensaje: 'El código no es válido o ya venció. Pide uno nuevo.',
        detalles: {},
      });
      // Vencido: se adelanta el vencimiento en la base.
      await contexto.fuente.query(
        `UPDATE codigos_recuperacion SET fecha_creacion = now() - interval '1 hour',
                fecha_vencimiento = now() - interval '45 minutes' WHERE id_usuario = $1`,
        [id],
      );
      reiniciarLimite();
      expect((await confirmar(CORREO_MARIA, bueno).expect(422)).body.codigo).toBe('CODIGO_INVALIDO');
      // Formato inválido → 400; correo inexistente → 422 igual.
      reiniciarLimite();
      await confirmar(CORREO_MARIA, '12ab').expect(400);
      await confirmar('nadie@ejemplo.test', bueno).expect(422);
      expect((await fila(id)).eliminado_en).toBeNull();
    });

    it('el código de recuperación de clave no sirve para eliminar, y el de eliminación no sirve para recuperar la clave', async () => {
      const { id } = await clienteVerificado();
      await http()
        .post('/api/v1/autenticacion/recuperacion/solicitud')
        .send({ correo: CORREO_MARIA })
        .expect(204);
      const deRecuperacion = contexto.correo.ultimoCodigo(CORREO_MARIA);
      reiniciarLimite();
      await confirmar(CORREO_MARIA, deRecuperacion).expect(422);

      reiniciarLimite();
      await solicitar(CORREO_MARIA).expect(204);
      const deEliminacion = contexto.correo.ultimoCodigo(CORREO_MARIA);
      reiniciarLimite();
      await http()
        .post('/api/v1/autenticacion/recuperacion')
        .send({ correo: CORREO_MARIA, codigo: deEliminacion, claveNueva: 'NuevaClave2026' })
        .expect(422);
      expect((await fila(id)).eliminado_en).toBeNull();
    });

    it('5 intentos fallidos invalidan el código aunque después llegue el correcto; el límite por IP responde 429', async () => {
      const { id } = await clienteVerificado();
      await solicitar(CORREO_MARIA).expect(204);
      const bueno = contexto.correo.ultimoCodigo(CORREO_MARIA);
      const malo = bueno === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        reiniciarLimite();
        await confirmar(CORREO_MARIA, malo).expect(422);
      }
      reiniciarLimite();
      await confirmar(CORREO_MARIA, bueno).expect(422);
      expect((await fila(id)).eliminado_en).toBeNull();

      reiniciarLimite();
      for (let i = 0; i < 5; i++) {
        await confirmar(CORREO_MARIA, malo).expect(422);
      }
      await confirmar(CORREO_MARIA, malo).expect(429);
    });

    it('la solicitud admite 3 por minuto por IP (429 después) y 3 envíos por hora por cuenta', async () => {
      await clienteVerificado();
      reiniciarLimite();
      for (let i = 0; i < 3; i++) {
        await solicitar(CORREO_MARIA).expect(204);
      }
      await solicitar(CORREO_MARIA).expect(429);
      expect(contexto.correo.enviados).toHaveLength(3);

      reiniciarLimite();
      await solicitar(CORREO_MARIA).expect(204);
      expect(contexto.correo.enviados).toHaveLength(3);
      expect((await auditoria('SOLICITUD_RECUPERACION_IGNORADA')).at(-1)?.detalle.motivo).toBe(
        'LIMITE_HORARIO',
      );
    });
  });

  describe('RF-USU-07: políticas públicas', () => {
    it.each([
      ['/politicas/privacidad', 'Política de privacidad'],
      ['/politicas/terminos', 'Términos de uso'],
      ['/politicas/eliminar-cuenta', 'Eliminar mi cuenta'],
    ])('GET %s → 200 HTML sin sesión, con CSP estricta, caché corta y sin datos personales', async (ruta, titulo) => {
      await clienteVerificado();

      const respuesta = await http().get(ruta).expect(200);

      expect(respuesta.headers['content-type']).toMatch(/^text\/html; charset=utf-8/);
      expect(respuesta.headers['cache-control']).toMatch(/public, max-age=\d+/);
      const csp = respuesta.headers['content-security-policy'];
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('unsafe-eval');
      expect(csp).not.toMatch(/https?:\/\//);
      const html = respuesta.text;
      expect(html).toContain(titulo);
      expect(html).toContain('lang="es"');
      expect(html).toContain('2026-11-18'.length > 0 ? 'Última actualización' : '');
      // Sin scripts en línea ni de terceros, sin datos personales.
      expect(html).not.toMatch(/<script(?![^>]*\ssrc="\/politicas\/[a-z-]+\.js")[^>]*>/);
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/https?:\/\/(?!localhost)/);
      for (const dato of [CORREO_MARIA, 'Zambrano', TELEFONO_MARIA, CORREO_VENDEDOR]) {
        expect(html).not.toContain(dato);
      }
    });

    it('la privacidad y los términos llevan la versión vigente; eliminar-cuenta trae el formulario que usa los dos endpoints', async () => {
      const aviso = await http().get('/api/v1/privacidad/aviso').expect(200);
      const privacidad = (await http().get('/politicas/privacidad').expect(200)).text;
      expect(privacidad).toContain(`Versión ${(aviso.body as { version: string }).version}`);
      expect((await http().get('/politicas/terminos').expect(200)).text).toContain('18 años');

      const paginaEliminar = (await http().get('/politicas/eliminar-cuenta').expect(200)).text;
      expect(paginaEliminar).toContain('<form id="paso-correo"');
      expect(paginaEliminar).toContain('<script src="/politicas/eliminar-cuenta.js"></script>');
      const script = await http().get('/politicas/eliminar-cuenta.js').expect(200);
      expect(script.headers['content-type']).toMatch(/^application\/javascript/);
      expect(script.text).toContain('/api/v1/autenticacion/eliminacion/solicitud');
      expect(script.text).toContain('/api/v1/autenticacion/eliminacion');
    });

    it('GET /api/v1/politicas (público) trae las versiones y las URL armadas con URL_PUBLICA; la versión de privacidad coincide con la del aviso', async () => {
      const respuesta = await http().get('/api/v1/politicas').expect(200);
      const aviso = await http().get('/api/v1/privacidad/aviso').expect(200);

      expect(respuesta.body).toEqual({
        privacidad: {
          version: (aviso.body as { version: string }).version,
          url: `${URL_PUBLICA}/politicas/privacidad`,
        },
        terminos: { version: '2026-11-1', url: `${URL_PUBLICA}/politicas/terminos` },
        eliminarCuenta: { url: `${URL_PUBLICA}/politicas/eliminar-cuenta` },
      });
    });

    it('las páginas no existen bajo el prefijo de la API ni se sirven con otros métodos', async () => {
      await http().get('/api/v1/politicas/privacidad').expect(404);
      await http().post('/politicas/privacidad').expect(404);
    });
  });

  describe('RF-USU-08: perfil comercial del Vendedor y GET /tienda', () => {
    const perfil = {
      nombreComercial: '  Belleza  de Ana ',
      ciudad: 'Portoviejo',
      provincia: 'Manabí',
      whatsapp: WHATSAPP_VENDEDOR,
    };

    it('GET /vendedor/perfil sin perfil → todos los campos null; PUT válido → 200 normalizado y se guarda; PUT otra vez reemplaza', async () => {
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
      const vacio = await conToken(http().get('/api/v1/vendedor/perfil'), vendedor.tokenAcceso).expect(200);
      expect(vacio.body).toEqual({
        nombreComercial: null,
        ciudad: null,
        provincia: null,
        whatsapp: null,
      });

      const guardado = await conToken(http().put('/api/v1/vendedor/perfil'), vendedor.tokenAcceso)
        .send(perfil)
        .expect(200);
      expect(guardado.body).toEqual({
        nombreComercial: 'Belleza de Ana',
        ciudad: 'Portoviejo',
        provincia: 'Manabí',
        whatsapp: WHATSAPP_E164,
      });
      expect(
        (await conToken(http().get('/api/v1/vendedor/perfil'), vendedor.tokenAcceso).expect(200)).body,
      ).toEqual(guardado.body);

      await conToken(http().put('/api/v1/vendedor/perfil'), vendedor.tokenAcceso)
        .send({ ...perfil, ciudad: 'Manta', provincia: 'manabi' })
        .expect(200);
      const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM perfiles_vendedor`,
      );
      expect(Number(total)).toBe(1);
    });

    it('PUT: teléfono o provincia inválidos, campos faltantes o extra → 400 por campo y no se guarda nada; la bitácora solo guarda nombres de campos', async () => {
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
      const put = (cuerpo: object) =>
        conToken(http().put('/api/v1/vendedor/perfil'), vendedor.tokenAcceso).send(cuerpo);

      const telefono = await put({ ...perfil, whatsapp: '022345678' }).expect(400);
      expect(telefono.body.codigo).toBe('DATOS_INVALIDOS');
      expect(JSON.stringify(telefono.body)).toContain('whatsapp');
      expect(JSON.stringify(telefono.body)).not.toContain('022345678');
      const provincia = await put({ ...perfil, provincia: 'Texas' }).expect(400);
      expect(JSON.stringify(provincia.body)).toContain('provincia');
      await put({ nombreComercial: 'A', ciudad: 'x', provincia: 'Texas', whatsapp: '1' }).expect(400);
      await put({ ciudad: 'Manta' }).expect(400);
      await put({ ...perfil, idUsuario: 'x' }).expect(400);
      const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM perfiles_vendedor`,
      );
      expect(Number(total)).toBe(0);
      expect(await auditoria('PERFIL_VENDEDOR_ACTUALIZADO')).toHaveLength(0);

      await put(perfil).expect(200);
      await put({ ...perfil, ciudad: 'Manta' }).expect(200);
      await put({ ...perfil, ciudad: 'Manta' }).expect(200);
      const filas = await auditoria('PERFIL_VENDEDOR_ACTUALIZADO');
      expect(filas.map((f) => f.detalle)).toEqual([
        { campos: ['nombreComercial', 'ciudad', 'provincia', 'whatsapp'] },
        { campos: ['ciudad'] },
        { campos: [] },
      ]);
      expect(filas[0]).toMatchObject({ id_usuario: vendedor.usuario.id, entidad: 'USUARIO' });
      expect(JSON.stringify(filas)).not.toContain('Belleza');
      expect(JSON.stringify(filas)).not.toContain('987000111');
    });

    it('el Cliente recibe 403 en GET y PUT /vendedor/perfil y no se guarda nada; sin sesión → 401', async () => {
      const { sesion: s } = await clienteVerificado();
      const get = await conToken(http().get('/api/v1/vendedor/perfil'), s.tokenAcceso).expect(403);
      expect(get.body).toEqual(NO_AUTORIZADO);
      await conToken(http().put('/api/v1/vendedor/perfil'), s.tokenAcceso).send(perfil).expect(403);
      await http().get('/api/v1/vendedor/perfil').expect(401);
      const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM perfiles_vendedor`,
      );
      expect(Number(total)).toBe(0);
    });

    it('GET /tienda: sin sesión → 401; sin perfil → 404 TIENDA_NO_CONFIGURADA; con perfil devuelve nombre, ciudad, provincia, pais EC y WhatsApp al Cliente y al Vendedor', async () => {
      await http().get('/api/v1/tienda').expect(401);
      const { sesion: cliente } = await clienteVerificado();
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);

      const sinPerfil = await conToken(http().get('/api/v1/tienda'), cliente.tokenAcceso).expect(404);
      expect(sinPerfil.body.codigo).toBe('TIENDA_NO_CONFIGURADA');

      await conToken(http().put('/api/v1/vendedor/perfil'), vendedor.tokenAcceso).send(perfil).expect(200);
      const esperado = {
        nombreComercial: 'Belleza de Ana',
        ciudad: 'Portoviejo',
        provincia: 'Manabí',
        pais: 'EC',
        whatsapp: WHATSAPP_E164,
      };
      expect((await conToken(http().get('/api/v1/tienda'), cliente.tokenAcceso).expect(200)).body).toEqual(esperado);
      expect((await conToken(http().get('/api/v1/tienda'), vendedor.tokenAcceso).expect(200)).body).toEqual(esperado);
    });

    it('el número de WhatsApp no aparece en ninguna otra respuesta, pública o con sesión', async () => {
      const { sesion: cliente } = await clienteVerificado();
      const vendedor = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
      await conToken(http().put('/api/v1/vendedor/perfil'), vendedor.tokenAcceso).send(perfil).expect(200);

      const rutas = [
        '/api/v1/politicas',
        '/api/v1/privacidad/aviso',
        '/politicas/privacidad',
        '/politicas/terminos',
        '/politicas/eliminar-cuenta',
        '/api/v1/salud',
      ];
      for (const ruta of rutas) {
        const texto = (await http().get(ruta)).text;
        expect(texto).not.toContain('987000111');
      }
      for (const ruta of ['/api/v1/usuarios/yo', '/api/v1/marcas', '/api/v1/productos']) {
        const texto = (await conToken(http().get(ruta), cliente.tokenAcceso).expect(200)).text;
        expect(texto).not.toContain('987000111');
      }
      const lista = (await conToken(http().get('/api/v1/usuarios'), vendedor.tokenAcceso).expect(200)).text;
      expect(lista).not.toContain('987000111');
    });
  });

  describe('D-60: dueño del producto y de la importación (id_vendedor)', () => {
    let primero: CuerpoSesion;
    let segundo: CuerpoSesion;
    let marcaId: string;

    const como = <T extends { set(c: string, v: string): T }>(s: CuerpoSesion, solicitud: T) =>
      conToken(solicitud, s.tokenAcceso);

    const crearConCodigo = (s: CuerpoSesion, nombre: string) =>
      como(s, http().post('/api/v1/productos')).send({ nombre, codigo: '43873', marcaId, precio: '1.00' });

    const importar = (s: CuerpoSesion, contenido: Buffer = catalogo()) =>
      como(s, http().post('/api/v1/productos/importaciones'))
        .field('marcaId', marcaId)
        .attach('archivo', contenido, { filename: 'catalogo.pdf', contentType: 'application/pdf' });

    beforeEach(async () => {
      await insertarSegundoVendedor();
      primero = await sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
      segundo = await sesion('vendedor', CORREO_SEGUNDO, CLAVE_VENDEDOR);
      marcaId = (
        await como(primero, http().post('/api/v1/marcas')).send({ nombre: 'Yanbal', color: '#2563EB' }).expect(201)
      ).body.id as string;
    });

    afterEach(async () => {
      // Se vuelve a un solo Vendedor y se restituye el índice único (D-21).
      await contexto.limpiar();
      await contexto.fuente.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_un_vendedor ON usuarios (rol) WHERE rol = 'VENDEDOR'`,
      );
      await crearVendedor();
    });

    it('el producto y la importación nuevos llevan el id del Vendedor autenticado (nunca del cliente) y la respuesta no lo expone', async () => {
      const producto = await como(segundo, http().post('/api/v1/productos'))
        .send({ nombre: 'Del segundo', marcaId, precio: '5.00' })
        .expect(201);
      expect(JSON.stringify(producto.body)).not.toMatch(/idVendedor|id_vendedor|vendedorId/);
      // Un id_vendedor enviado en el cuerpo se rechaza (campo no declarado).
      await como(primero, http().post('/api/v1/productos'))
        .send({ nombre: 'X', marcaId, precio: '5.00', idVendedor: segundo.usuario.id })
        .expect(400);

      const importacion = await importar(primero).expect(201);
      expect(JSON.stringify(importacion.body)).not.toMatch(/idVendedor|id_vendedor/);

      const productos = await contexto.fuente.query<{ id_vendedor: string }[]>(
        `SELECT id_vendedor FROM productos`,
      );
      expect(productos).toEqual([{ id_vendedor: segundo.usuario.id }]);
      const importaciones = await contexto.fuente.query<{ id_vendedor: string }[]>(
        `SELECT id_vendedor FROM importaciones_producto`,
      );
      expect(importaciones).toEqual([{ id_vendedor: primero.usuario.id }]);
    });

    it('un segundo Vendedor recibe 404 al consultar, PATCH, DELETE o tocar las imágenes del producto del primero, y nada cambia', async () => {
      const creado = await como(primero, http().post('/api/v1/productos'))
        .send({ nombre: 'Del primero', marcaId, precio: '10.00' })
        .expect(201);
      const id = (creado.body as { id: string }).id;
      const imagen = await como(primero, http().post(`/api/v1/productos/${id}/imagenes`))
        .attach('archivo', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      const idImagen = (imagen.body as { id: string }).id;
      const ruta = `/api/v1/productos/${id}`;

      await como(segundo, http().get(ruta)).expect(404);
      await como(segundo, http().patch(ruta)).send({ precio: '99.00' }).expect(404);
      await como(segundo, http().delete(ruta)).expect(404);
      await como(segundo, http().post(`${ruta}/imagenes`))
        .attach('archivo', PNG, { filename: 'b.png', contentType: 'image/png' })
        .expect(404);
      await como(segundo, http().put(`${ruta}/imagenes/orden`)).send({ ids: [idImagen] }).expect(404);
      await como(segundo, http().delete(`${ruta}/imagenes/${idImagen}`)).expect(404);

      const [producto] = await contexto.fuente.query<{ precio: string; eliminado_en: Date | null }[]>(
        `SELECT precio, eliminado_en FROM productos WHERE id = $1`,
        [id],
      );
      expect(producto).toEqual({ precio: '10.00', eliminado_en: null });
      const [{ imagenes }] = await contexto.fuente.query<{ imagenes: string }[]>(
        `SELECT count(*) AS imagenes FROM imagenes_producto WHERE id_producto = $1`,
        [id],
      );
      expect(Number(imagenes)).toBe(1);
      // El dueño sí puede.
      await como(primero, http().patch(ruta)).send({ precio: '11.00' }).expect(200);
    });

    it('el Vendedor solo lista sus productos; el Cliente ve el catálogo activo de todos', async () => {
      await como(primero, http().post('/api/v1/productos')).send({ nombre: 'Uno', marcaId, precio: '1.00' }).expect(201);
      await como(segundo, http().post('/api/v1/productos')).send({ nombre: 'Dos', marcaId, precio: '2.00' }).expect(201);
      const { sesion: cliente } = await clienteVerificado();

      expect(nombres(await como(primero, http().get('/api/v1/productos')).expect(200))).toEqual(['Uno']);
      expect(nombres(await como(segundo, http().get('/api/v1/productos')).expect(200))).toEqual(['Dos']);
      expect(nombres(await conToken(http().get('/api/v1/productos'), cliente.tokenAcceso).expect(200))).toEqual([
        'Dos',
        'Uno',
      ]);
    });

    it('el mismo código de catálogo en la misma marca es válido para dos Vendedores y sigue siendo único dentro de cada uno', async () => {
      await crearConCodigo(primero, 'Ana').expect(201);
      await crearConCodigo(segundo, 'Beto').expect(201);
      expect((await crearConCodigo(primero, 'Carla').expect(409)).body.codigo).toBe('CODIGO_DUPLICADO');
    });

    it('un segundo Vendedor recibe 404 al consultar, listar borradores, ver ausentes o eliminar la importación del primero, y no la ve en su lista', async () => {
      const importacion = (await importar(primero).expect(201)).body as { id: string };
      const ruta = `/api/v1/productos/importaciones/${importacion.id}`;

      await como(segundo, http().get(ruta)).expect(404);
      await como(segundo, http().get(`${ruta}/borradores`)).expect(404);
      await como(segundo, http().get(`${ruta}/ausentes`)).expect(404);
      await como(segundo, http().delete(ruta)).expect(404);
      const lista = await como(segundo, http().get('/api/v1/productos/importaciones')).expect(200);
      expect((lista.body as { total: number }).total).toBe(0);
      expect(
        ((await como(primero, http().get('/api/v1/productos/importaciones')).expect(200)).body as { total: number })
          .total,
      ).toBe(1);

      const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM importaciones_producto`,
      );
      expect(Number(total)).toBe(1);
      await como(primero, http().get(ruta)).expect(200);
    });

    it('un segundo Vendedor no puede editar, aprobar ni descartar los borradores del primero (404 / NO_ENCONTRADO) y no se crea ningún producto', async () => {
      const importacion = (await importar(primero).expect(201)).body as { id: string };
      const borradores = (
        await como(primero, http().get(`/api/v1/productos/importaciones/${importacion.id}/borradores`)).expect(200)
      ).body.elementos as Array<{ id: string }>;
      const idBorrador = borradores[0].id;

      await como(segundo, http().patch(`/api/v1/productos/importaciones/borradores/${idBorrador}`))
        .send({ precio: '1.00' })
        .expect(404);
      const aprobar = await como(segundo, http().post('/api/v1/productos/importaciones/borradores/aprobar'))
        .send({ ids: [idBorrador] })
        .expect(200);
      expect(aprobar.body).toEqual({ resultados: [{ id: idBorrador, error: 'NO_ENCONTRADO' }] });
      const descartar = await como(segundo, http().post('/api/v1/productos/importaciones/borradores/descartar'))
        .send({ ids: [idBorrador] })
        .expect(200);
      expect(descartar.body).toEqual({ resultados: [{ id: idBorrador, error: 'NO_ENCONTRADO' }] });

      const [{ productos }] = await contexto.fuente.query<{ productos: string }[]>(
        `SELECT count(*) AS productos FROM productos`,
      );
      expect(Number(productos)).toBe(0);
      const [{ estado }] = await contexto.fuente.query<{ estado: string }[]>(
        `SELECT estado FROM borradores_producto WHERE id = $1`,
        [idBorrador],
      );
      expect(estado).toBe('PENDIENTE');
      // El dueño sí aprueba y el producto queda suyo.
      const propio = await como(primero, http().post('/api/v1/productos/importaciones/borradores/aprobar'))
        .send({ ids: [idBorrador] })
        .expect(200);
      expect(propio.body.resultados[0]).toMatchObject({ estado: 'APROBADO', accion: 'CREADO' });
      const [producto] = await contexto.fuente.query<{ id_vendedor: string }[]>(`SELECT id_vendedor FROM productos`);
      expect(producto.id_vendedor).toBe(primero.usuario.id);
    });

    it('el mismo PDF de dos Vendedores no choca y cada uno conserva su importación vigente; el mismo Vendedor sí recibe 409 sin ver la de otro', async () => {
      const a = await importar(primero).expect(201);
      const b = await importar(segundo).expect(201);
      expect((b.body as { id: string }).id).not.toBe((a.body as { id: string }).id);
      expect((b.body as { estado: string }).estado).toBe('VIGENTE');
      expect(((await importar(primero).expect(409)).body as { codigo: string }).codigo).toBe(
        'IMPORTACION_DUPLICADA',
      );
      const primeraEstado = await como(primero, http().get(`/api/v1/productos/importaciones/${(a.body as { id: string }).id}`)).expect(200);
      expect((primeraEstado.body as { estado: string }).estado).toBe('VIGENTE');
    });

    it('un Cliente sigue recibiendo 403 en las rutas de gestión (CA-02)', async () => {
      const { sesion: cliente } = await clienteVerificado();
      await conToken(http().get('/api/v1/productos/importaciones'), cliente.tokenAcceso).expect(403);
      await conToken(http().post('/api/v1/productos'), cliente.tokenAcceso)
        .send({ nombre: 'X', marcaId, precio: '1.00' })
        .expect(403);
    });
  });
});
