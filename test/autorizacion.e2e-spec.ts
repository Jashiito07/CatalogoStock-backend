import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';
import {
  ControladorPruebasAutorizacion,
  RUTA_PRUEBAS_AUTORIZACION,
} from './preparacion/controlador-pruebas-autorizacion.js';

/**
 * e2e de la subfase 1.4 (RF-USU-03, CA-02) contra `catalogostock_pruebas`
 * (D-23): guard global de autenticación, `@Publico()`, `@Roles`,
 * `GET /usuarios/yo` y orden de los guards respecto del límite de intentos.
 *
 * La ruta del Vendedor que modifica datos vive en un controlador solo de
 * pruebas (`ControladorPruebasAutorizacion`): el contrato no tiene todavía una
 * ruta administrativa real fuera de `GET /auditoria` (subfase 1.5).
 */

const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';

const REGISTRO_MARIA = {
  nombre: 'María Zambrano',
  correo: 'maria.zambrano@ejemplo.test',
  telefono: '0991234567',
  clave: CLAVE,
  aceptaPrivacidad: true,
  versionPrivacidad: VERSION_AVISO,
};

const CAMPOS_USUARIO_PUBLICO = [
  'correo',
  'creadoEn',
  'id',
  'nombre',
  'privacidadAceptadaEn',
  'rol',
  'telefono',
  'versionPrivacidad',
];

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

function conToken<T extends { set(campo: string, valor: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

function base64Url(valor: object): string {
  return Buffer.from(JSON.stringify(valor)).toString('base64url');
}

describe('Subfase 1.4 (e2e): protección de rutas por rol (RF-USU-03, CA-02)', () => {
  let contexto: AppPruebas;

  const http = () => request(contexto.app.getHttpServer());
  const jwt = () => contexto.app.get(JwtService, { strict: false });

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

  async function sesionCliente(): Promise<CuerpoSesion> {
    await http()
      .post('/api/v1/usuarios/registro')
      .send(REGISTRO_MARIA)
      .expect(201);
    const respuesta = await http()
      .post('/api/v1/autenticacion/ingreso/cliente')
      .send({ correo: REGISTRO_MARIA.correo, clave: CLAVE })
      .expect(200);
    return respuesta.body as CuerpoSesion;
  }

  async function sesionVendedor(): Promise<CuerpoSesion> {
    await crearVendedor();
    const respuesta = await http()
      .post('/api/v1/autenticacion/ingreso/vendedor')
      .send({ correo: CORREO_VENDEDOR, clave: CLAVE_VENDEDOR })
      .expect(200);
    return respuesta.body as CuerpoSesion;
  }

  /** Copia completa de las tablas de la API para comprobar que nada cambió. */
  async function instantanea(): Promise<unknown> {
    const usuarios = await contexto.fuente.query(
      'SELECT * FROM usuarios ORDER BY id',
    );
    const sesiones = await contexto.fuente.query(
      'SELECT * FROM sesiones ORDER BY id',
    );
    return { usuarios, sesiones };
  }

  async function estaActivo(id: string): Promise<boolean> {
    const [fila] = await contexto.fuente.query<{ activo: boolean }[]>(
      'SELECT activo FROM usuarios WHERE id = $1',
      [id],
    );
    return fila.activo;
  }

  async function tokenVencido(sub: string, rol: string): Promise<string> {
    const haceUnaHora = Math.floor(Date.now() / 1000) - 3600;
    return jwt().signAsync({ sub, rol, iat: haceUnaHora }, { expiresIn: 900 });
  }

  beforeAll(async () => {
    contexto = await crearAppPruebas({
      controladoresPrueba: [ControladorPruebasAutorizacion],
    });
  });

  beforeEach(async () => {
    await contexto.limpiar();
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('CA-02: un Cliente que invoca una función del Vendedor', () => {
    it('Dado una sesión con rol Cliente, cuando invoca una función administrativa, entonces la API responde 403 NO_AUTORIZADO y no se modifica ningún dato', async () => {
      const cliente = await sesionCliente();
      await sesionVendedor();
      const antes = await instantanea();

      const respuesta = await conToken(
        http().post(
          `${RUTA_PRUEBAS_AUTORIZACION}/usuarios/${cliente.usuario.id}/desactivar`,
        ),
        cliente.tokenAcceso,
      ).expect(403);

      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      expect(await instantanea()).toEqual(antes);
      expect(await estaActivo(cliente.usuario.id)).toBe(true);
    });

    it('control: el Vendedor sí puede usar esa ruta y el cambio se aplica (la ruta modifica datos de verdad)', async () => {
      const cliente = await sesionCliente();
      const vendedor = await sesionVendedor();

      await conToken(
        http().post(
          `${RUTA_PRUEBAS_AUTORIZACION}/usuarios/${cliente.usuario.id}/desactivar`,
        ),
        vendedor.tokenAcceso,
      )
        .expect(200)
        .expect({ desactivado: true });

      expect(await estaActivo(cliente.usuario.id)).toBe(false);
      // Con la cuenta desactivada, /usuarios/yo ya no la reconoce.
      const yo = await conToken(
        http().get('/api/v1/usuarios/yo'),
        cliente.tokenAcceso,
      ).expect(401);
      expect(yo.body.codigo).toBe('NO_AUTENTICADO');
    });

    it('un token de Cliente con el rol cambiado a VENDEDOR (firma alterada) → 401 NO_AUTENTICADO y nada cambia', async () => {
      const cliente = await sesionCliente();
      const [cabecera, , firma] = cliente.tokenAcceso.split('.');
      const contenido = await jwt().verifyAsync<Record<string, unknown>>(
        cliente.tokenAcceso,
      );
      const falsificado = `${cabecera}.${base64Url({ ...contenido, rol: 'VENDEDOR' })}.${firma}`;
      const antes = await instantanea();

      const respuesta = await conToken(
        http().post(
          `${RUTA_PRUEBAS_AUTORIZACION}/usuarios/${cliente.usuario.id}/desactivar`,
        ),
        falsificado,
      ).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
      expect(await instantanea()).toEqual(antes);
    });

    it('el Vendedor en una ruta solo de Clientes → 403 NO_AUTORIZADO', async () => {
      const vendedor = await sesionVendedor();

      const respuesta = await conToken(
        http().get(`${RUTA_PRUEBAS_AUTORIZACION}/solo-cliente`),
        vendedor.tokenAcceso,
      ).expect(403);

      expect(respuesta.body).toEqual(NO_AUTORIZADO);
    });

    it('una ruta sin @Roles admite a cualquier usuario autenticado y @UsuarioActual entrega { id, rol }', async () => {
      const cliente = await sesionCliente();
      const vendedor = await sesionVendedor();

      for (const sesion of [cliente, vendedor]) {
        await conToken(
          http().get(`${RUTA_PRUEBAS_AUTORIZACION}/autenticada`),
          sesion.tokenAcceso,
        )
          .expect(200)
          .expect({ id: sesion.usuario.id, rol: sesion.usuario.rol });
      }
    });
  });

  describe('401 en rutas protegidas (contrato: errores comunes)', () => {
    it('sin token → 401 NO_AUTENTICADO y no se modifica ningún dato', async () => {
      const cliente = await sesionCliente();
      const antes = await instantanea();

      const respuesta = await http()
        .post(
          `${RUTA_PRUEBAS_AUTORIZACION}/usuarios/${cliente.usuario.id}/desactivar`,
        )
        .expect(401);

      expect(respuesta.body).toEqual({
        codigo: 'NO_AUTENTICADO',
        mensaje: 'Debe iniciar sesión para continuar.',
        detalles: {},
      });
      expect(await instantanea()).toEqual(antes);
    });

    it('token vencido → 401 TOKEN_VENCIDO y no se modifica ningún dato', async () => {
      await crearVendedor();
      const cliente = await sesionCliente();
      const [{ id: idVendedor }] = await contexto.fuente.query<
        { id: string }[]
      >(`SELECT id FROM usuarios WHERE rol = 'VENDEDOR'`);
      const vencido = await tokenVencido(idVendedor, 'VENDEDOR');
      const antes = await instantanea();

      const respuesta = await conToken(
        http().post(
          `${RUTA_PRUEBAS_AUTORIZACION}/usuarios/${cliente.usuario.id}/desactivar`,
        ),
        vencido,
      ).expect(401);

      expect(respuesta.body.codigo).toBe('TOKEN_VENCIDO');
      expect(await instantanea()).toEqual(antes);
    });

    it('firma alterada → 401 NO_AUTENTICADO', async () => {
      const cliente = await sesionCliente();
      const [cabecera, contenido] = cliente.tokenAcceso.split('.');

      const respuesta = await conToken(
        http().get('/api/v1/usuarios/yo'),
        `${cabecera}.${contenido}.firmaFalsa`,
      ).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
    });

    it('firmado con otro secreto → 401 NO_AUTENTICADO', async () => {
      const cliente = await sesionCliente();
      const ajeno = await new JwtService({
        secret: 'otro-secreto-de-pruebas-de-al-menos-32-caracteres',
      }).signAsync(
        { sub: cliente.usuario.id, rol: 'CLIENTE' },
        { expiresIn: 900, algorithm: 'HS256' },
      );

      const respuesta = await conToken(
        http().get('/api/v1/usuarios/yo'),
        ajeno,
      ).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
    });

    it('sin firma (alg: none) → 401 NO_AUTENTICADO', async () => {
      const cliente = await sesionCliente();
      const ahora = Math.floor(Date.now() / 1000);
      const sinFirma = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({
        sub: cliente.usuario.id,
        rol: 'VENDEDOR',
        iat: ahora,
        exp: ahora + 900,
      })}.`;

      // Sin tercer segmento no es un Bearer bien formado; con uno ficticio la firma no vale.
      for (const token of [sinFirma, `${sinFirma}x`]) {
        const respuesta = await conToken(
          http().get('/api/v1/usuarios/yo'),
          token,
        ).expect(401);
        expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
      }
    });

    it('el token de renovación no sirve como token de acceso → 401 NO_AUTENTICADO', async () => {
      const cliente = await sesionCliente();

      const respuesta = await conToken(
        http().get('/api/v1/usuarios/yo'),
        cliente.tokenRenovacion,
      ).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
    });
  });

  describe('GET /api/v1/usuarios/yo (RF-USU-01, RF-USU-02)', () => {
    it('CA-01: registro → ingreso → /usuarios/yo devuelve al Cliente con su rol, sin clave ni hash', async () => {
      const cliente = await sesionCliente();

      const respuesta = await conToken(
        http().get('/api/v1/usuarios/yo'),
        cliente.tokenAcceso,
      ).expect(200);

      expect(Object.keys(respuesta.body as object).toSorted()).toEqual(
        CAMPOS_USUARIO_PUBLICO,
      );
      expect(respuesta.body).toMatchObject({
        id: cliente.usuario.id,
        nombre: REGISTRO_MARIA.nombre,
        correo: REGISTRO_MARIA.correo,
        telefono: '+593991234567',
        rol: 'CLIENTE',
        versionPrivacidad: VERSION_AVISO,
      });
      const texto = JSON.stringify(respuesta.body);
      expect(texto).not.toMatch(/\$2[aby]\$/);
      expect(texto).not.toContain(CLAVE);
      expect(texto).not.toContain(cliente.tokenRenovacion);
    });

    it('CA-01: con el Vendedor devuelve sus datos con rol VENDEDOR', async () => {
      const vendedor = await sesionVendedor();

      const respuesta = await conToken(
        http().get('/api/v1/usuarios/yo'),
        vendedor.tokenAcceso,
      ).expect(200);

      expect(Object.keys(respuesta.body as object).toSorted()).toEqual(
        CAMPOS_USUARIO_PUBLICO,
      );
      expect(respuesta.body).toMatchObject({
        id: vendedor.usuario.id,
        correo: CORREO_VENDEDOR,
        rol: 'VENDEDOR',
        privacidadAceptadaEn: null,
        versionPrivacidad: null,
      });
      expect(JSON.stringify(respuesta.body)).not.toContain(CLAVE_VENDEDOR);
    });

    it('propiedad: cada token ve solo a su usuario', async () => {
      const cliente = await sesionCliente();
      const vendedor = await sesionVendedor();

      const deCliente = await conToken(
        http().get('/api/v1/usuarios/yo'),
        cliente.tokenAcceso,
      ).expect(200);
      const deVendedor = await conToken(
        http().get('/api/v1/usuarios/yo'),
        vendedor.tokenAcceso,
      ).expect(200);

      expect(deCliente.body.id).toBe(cliente.usuario.id);
      expect(deVendedor.body.id).toBe(vendedor.usuario.id);
    });

    it('sin token → 401 NO_AUTENTICADO; vencido → 401 TOKEN_VENCIDO', async () => {
      const cliente = await sesionCliente();

      const sinToken = await http().get('/api/v1/usuarios/yo').expect(401);
      const vencido = await conToken(
        http().get('/api/v1/usuarios/yo'),
        await tokenVencido(cliente.usuario.id, 'CLIENTE'),
      ).expect(401);

      expect(sinToken.body.codigo).toBe('NO_AUTENTICADO');
      expect(vencido.body.codigo).toBe('TOKEN_VENCIDO');
    });

    it('token válido de una cuenta que ya no existe → 401 NO_AUTENTICADO', async () => {
      const token = await jwt().signAsync(
        { sub: '00000000-0000-4000-8000-000000000999', rol: 'CLIENTE' },
        { expiresIn: 900 },
      );

      const respuesta = await conToken(
        http().get('/api/v1/usuarios/yo'),
        token,
      ).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
    });
  });

  describe('@Publico(): las rutas abiertas del contrato funcionan sin token', () => {
    it('salud, aviso de privacidad, registro, ingreso del Cliente y del Vendedor y renovación', async () => {
      await http().get('/api/v1/salud').expect(200);
      await http().get('/api/v1/privacidad/aviso').expect(200);
      await http()
        .post('/api/v1/usuarios/registro')
        .send(REGISTRO_MARIA)
        .expect(201);
      const cliente = await http()
        .post('/api/v1/autenticacion/ingreso/cliente')
        .send({ correo: REGISTRO_MARIA.correo, clave: CLAVE })
        .expect(200);
      await crearVendedor();
      await http()
        .post('/api/v1/autenticacion/ingreso/vendedor')
        .send({ correo: CORREO_VENDEDOR, clave: CLAVE_VENDEDOR })
        .expect(200);
      await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({
          tokenRenovacion: (cliente.body as CuerpoSesion).tokenRenovacion,
        })
        .expect(200);
    });

    it('una ruta pública ignora un token de acceso inválido', async () => {
      await conToken(
        http().get('/api/v1/privacidad/aviso'),
        'aaa.bbb.ccc',
      ).expect(200);
    });

    it('/autenticacion/salida no es pública: sin token → 401 NO_AUTENTICADO', async () => {
      const respuesta = await http()
        .post('/api/v1/autenticacion/salida')
        .send({ tokenRenovacion: 'cualquiera' })
        .expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
    });
  });

  describe('D-17: el límite de intentos va antes que la autenticación', () => {
    it('una ruta protegida y limitada cuenta los intentos sin token y al sexto responde 429', async () => {
      for (let intento = 1; intento <= 5; intento++) {
        await http().get(`${RUTA_PRUEBAS_AUTORIZACION}/limitada`).expect(401);
      }

      const respuesta = await http()
        .get(`${RUTA_PRUEBAS_AUTORIZACION}/limitada`)
        .expect(429);

      expect(respuesta.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
      expect(respuesta.headers['retry-after']).toMatch(/^\d+$/);
    });
  });
});
