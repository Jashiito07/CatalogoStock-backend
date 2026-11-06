import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la subfase 1.3 contra la base `catalogostock_pruebas` (D-23):
 * registro, ingreso por canal, renovación con rotación, salida, aviso de
 * privacidad y límite de intentos. Datos ficticios.
 */

const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';

const REGISTRO_VALIDO = {
  nombre: 'María Zambrano',
  correo: 'Maria.Zambrano@Ejemplo.test',
  telefono: '0991234567',
  clave: CLAVE,
  aceptaPrivacidad: true,
  versionPrivacidad: VERSION_AVISO,
};

const CREDENCIALES_INVALIDAS = {
  codigo: 'CREDENCIALES_INVALIDAS',
  mensaje: 'Correo o clave incorrectos.',
  detalles: {},
};

interface CuerpoSesion {
  tokenAcceso: string;
  venceAccesoEn: string;
  tokenRenovacion: string;
  venceRenovacionEn: string;
  usuario: { id: string; rol: string; correo: string };
}

describe('Subfase 1.3 (e2e): registro, inicio de sesión y tokens', () => {
  let contexto: AppPruebas;

  const http = () => request(contexto.app.getHttpServer());

  const registrar = (cuerpo: Record<string, unknown> = REGISTRO_VALIDO) =>
    http().post('/api/v1/usuarios/registro').send(cuerpo);

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

  const salir = (tokenAcceso: string | null, tokenRenovacion: string) => {
    const solicitud = http().post('/api/v1/autenticacion/salida');
    if (tokenAcceso !== null) {
      solicitud.set('Authorization', `Bearer ${tokenAcceso}`);
    }
    return solicitud.send({ tokenRenovacion });
  };

  async function contar(tabla: 'usuarios' | 'sesiones'): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM ${tabla}`,
    );
    return Number(total);
  }

  async function sesionesVigentes(): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM sesiones
       WHERE fecha_revocacion IS NULL AND fecha_vencimiento > now()`,
    );
    return Number(total);
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

  async function registrarEIngresar(): Promise<CuerpoSesion> {
    await registrar().expect(201);
    const respuesta = await ingresar(
      'cliente',
      REGISTRO_VALIDO.correo,
      CLAVE,
    ).expect(200);
    return respuesta.body as CuerpoSesion;
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

  describe('GET /api/v1/privacidad/aviso (RNF-16, D-15)', () => {
    it('devuelve la versión vigente y el texto empieza con «PROVISIONAL»', async () => {
      const respuesta = await http()
        .get('/api/v1/privacidad/aviso')
        .expect(200);

      expect(respuesta.body).toEqual({
        version: VERSION_AVISO,
        titulo: 'Aviso de privacidad de CatálogoStock',
        contenido: expect.stringMatching(
          /^PROVISIONAL – revisar antes de publicar/,
        ) as unknown,
        vigenteDesde: '2026-11-05T05:00:00.000Z',
      });
    });
  });

  describe('POST /api/v1/usuarios/registro (RF-USU-01, D-07, D-11, D-14)', () => {
    it('registro correcto → 201 con rol CLIENTE, sin clave ni hash, y la clave guardada solo como hash (RNF-02)', async () => {
      const respuesta = await registrar().expect(201);

      expect(Object.keys(respuesta.body as object).toSorted()).toEqual([
        'correo',
        'creadoEn',
        'id',
        'nombre',
        'privacidadAceptadaEn',
        'rol',
        'telefono',
        'versionPrivacidad',
      ]);
      expect(respuesta.body).toMatchObject({
        nombre: 'María Zambrano',
        correo: 'maria.zambrano@ejemplo.test',
        telefono: '+593991234567',
        rol: 'CLIENTE',
        versionPrivacidad: VERSION_AVISO,
      });
      expect(JSON.stringify(respuesta.body)).not.toContain(CLAVE);

      const [fila] = await contexto.fuente.query<
        { hash_clave: string; rol: string; fecha_aceptacion_privacidad: Date }[]
      >('SELECT hash_clave, rol, fecha_aceptacion_privacidad FROM usuarios');
      expect(fila.rol).toBe('CLIENTE');
      expect(fila.hash_clave).toMatch(/^\$2b\$10\$/);
      expect(fila.hash_clave).not.toContain(CLAVE);
      expect(fila.fecha_aceptacion_privacidad).not.toBeNull();
      // Registro sin sesión automática.
      expect(await contar('sesiones')).toBe(0);
    });

    it('RNF-03: datos inválidos → 400 DATOS_INVALIDOS con todos los campos, sin repetir valores y sin crear nada', async () => {
      const respuesta = await registrar({
        ...REGISTRO_VALIDO,
        nombre: 'A',
        correo: 'sin-arroba',
        telefono: '052123456',
        clave: 'sinnumeros',
      }).expect(400);

      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      const campos = (
        respuesta.body.detalles.errores as { campo: string }[]
      ).map((e) => e.campo);
      expect(campos.toSorted()).toEqual([
        'clave',
        'correo',
        'nombre',
        'telefono',
      ]);
      expect(JSON.stringify(respuesta.body)).not.toContain('sinnumeros');
      expect(JSON.stringify(respuesta.body)).not.toContain('sin-arroba');
      expect(await contar('usuarios')).toBe(0);
    });

    it('D-14: un fijo o un número extranjero → 400 en telefono', async () => {
      const respuesta = await registrar({
        ...REGISTRO_VALIDO,
        telefono: '+12025550123',
      }).expect(400);

      expect(respuesta.body.detalles.errores).toEqual([
        {
          campo: 'telefono',
          errores: [
            'Ingrese un celular de Ecuador válido, por ejemplo 0991234567.',
          ],
        },
      ]);
      expect(await contar('usuarios')).toBe(0);
    });

    it('D-07 / RNF-03: intentar registrarse con rol VENDEDOR → 400 y nada creado', async () => {
      const respuesta = await registrar({
        ...REGISTRO_VALIDO,
        rol: 'VENDEDOR',
      }).expect(400);

      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      expect(respuesta.body.detalles.errores).toEqual([
        { campo: 'rol', errores: [expect.any(String) as unknown] },
      ]);
      expect(await contar('usuarios')).toBe(0);
    });

    it('correo repetido (con distinta mayúscula) → 409 CORREO_YA_REGISTRADO', async () => {
      await registrar().expect(201);

      const respuesta = await registrar({
        ...REGISTRO_VALIDO,
        correo: 'MARIA.ZAMBRANO@EJEMPLO.TEST',
      }).expect(409);

      expect(respuesta.body).toEqual({
        codigo: 'CORREO_YA_REGISTRADO',
        mensaje: 'Ya existe una cuenta con ese correo.',
        detalles: {},
      });
      expect(await contar('usuarios')).toBe(1);
    });

    it('RNF-16: sin aceptar el aviso → 422 PRIVACIDAD_NO_ACEPTADA y nada creado', async () => {
      const respuesta = await registrar({
        ...REGISTRO_VALIDO,
        aceptaPrivacidad: false,
      }).expect(422);

      expect(respuesta.body.codigo).toBe('PRIVACIDAD_NO_ACEPTADA');
      expect(await contar('usuarios')).toBe(0);
    });

    it('D-11: versión del aviso que no es la vigente → 422 PRIVACIDAD_DESACTUALIZADA', async () => {
      const respuesta = await registrar({
        ...REGISTRO_VALIDO,
        versionPrivacidad: '2025-01-1',
      }).expect(422);

      expect(respuesta.body).toMatchObject({
        codigo: 'PRIVACIDAD_DESACTUALIZADA',
        detalles: { versionVigente: VERSION_AVISO },
      });
      expect(await contar('usuarios')).toBe(0);
    });
  });

  describe('CA-01: registro → ingreso → acceso; credenciales incorrectas → 401', () => {
    it('Dado un cliente recién registrado, cuando ingresa por /ingreso/cliente con credenciales válidas, entonces recibe una sesión válida de su rol', async () => {
      const registro = await registrar().expect(201);

      const respuesta = await ingresar(
        'cliente',
        'maria.zambrano@ejemplo.test',
        CLAVE,
      ).expect(200);

      const sesion = respuesta.body as CuerpoSesion;
      expect(sesion.usuario).toMatchObject({
        id: registro.body.id,
        rol: 'CLIENTE',
      });
      // El token de acceso es un JWT válido con sub, rol, iat y exp (15 min).
      const contenido = await contexto.app
        .get(JwtService, { strict: false })
        .verifyAsync<{ sub: string; rol: string; iat: number; exp: number }>(
          sesion.tokenAcceso,
        );
      expect(contenido).toMatchObject({
        sub: registro.body.id,
        rol: 'CLIENTE',
      });
      expect(contenido.exp - contenido.iat).toBe(900);
      expect(new Date(sesion.venceAccesoEn).getTime()).toBe(
        contenido.exp * 1000,
      );
      // Token de renovación de 7 días.
      const diasRenovacion =
        (new Date(sesion.venceRenovacionEn).getTime() - contenido.iat * 1000) /
        86_400_000;
      expect(Math.round(diasRenovacion)).toBe(7);
      // La API acepta el token de acceso en una ruta autenticada.
      await salir(sesion.tokenAcceso, 'token-desconocido').expect(204);

      // D-09 / D-19: la sesión guarda el canal y solo el hash del token.
      const filas = await contexto.fuente.query<
        { canal: string; hash_token: string }[]
      >('SELECT canal, hash_token FROM sesiones');
      expect(filas).toHaveLength(1);
      expect(filas[0].canal).toBe('APP');
      expect(filas[0].hash_token).toMatch(/^[0-9a-f]{64}$/);
      expect(filas[0].hash_token).not.toBe(sesion.tokenRenovacion);
    });

    it('Cuando la clave es incorrecta o el correo no existe, entonces recibe el mismo 401 y no se crea sesión', async () => {
      await registrar().expect(201);

      const claveMala = await ingresar(
        'cliente',
        REGISTRO_VALIDO.correo,
        'OtraClave2026',
      ).expect(401);
      const correoInexistente = await ingresar(
        'cliente',
        'nadie@ejemplo.test',
        CLAVE,
      ).expect(401);

      expect(claveMala.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(correoInexistente.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await contar('sesiones')).toBe(0);
    });

    it('falta la clave → 400 DATOS_INVALIDOS', async () => {
      const respuesta = await http()
        .post('/api/v1/autenticacion/ingreso/cliente')
        .send({ correo: 'alguien@ejemplo.test' })
        .expect(400);

      expect(respuesta.body.detalles.errores).toEqual([
        { campo: 'clave', errores: ['Ingrese su clave.'] },
      ]);
    });
  });

  describe('D-19: ingreso por canal filtrado por rol', () => {
    it('un Cliente por /ingreso/vendedor → mismo 401 y no se crea sesión', async () => {
      await registrar().expect(201);

      const respuesta = await ingresar(
        'vendedor',
        REGISTRO_VALIDO.correo,
        CLAVE,
      ).expect(401);

      expect(respuesta.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await contar('sesiones')).toBe(0);
    });

    it('el Vendedor por /ingreso/cliente → mismo 401 y no se crea sesión', async () => {
      await crearVendedor();

      const respuesta = await ingresar(
        'cliente',
        CORREO_VENDEDOR,
        CLAVE_VENDEDOR,
      ).expect(401);

      expect(respuesta.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await contar('sesiones')).toBe(0);
    });

    it('CA-01: el Vendedor por /ingreso/vendedor → 200 con rol VENDEDOR y canal PANEL', async () => {
      const idVendedor = await crearVendedor();

      const respuesta = await ingresar(
        'vendedor',
        CORREO_VENDEDOR,
        CLAVE_VENDEDOR,
      ).expect(200);

      expect(respuesta.body.usuario).toMatchObject({
        id: idVendedor,
        rol: 'VENDEDOR',
        privacidadAceptadaEn: null,
      });
      const [fila] = await contexto.fuente.query<{ canal: string }[]>(
        'SELECT canal FROM sesiones',
      );
      expect(fila.canal).toBe('PANEL');
    });
  });

  describe('POST /api/v1/autenticacion/renovacion (D-09: rotación)', () => {
    it('rota el token: entrega un par nuevo y conserva el canal', async () => {
      const inicial = await registrarEIngresar();

      const respuesta = await renovar(inicial.tokenRenovacion).expect(200);

      const renovada = respuesta.body as CuerpoSesion;
      expect(renovada.tokenRenovacion).not.toBe(inicial.tokenRenovacion);
      expect(renovada.usuario.rol).toBe('CLIENTE');
      const filas = await contexto.fuente.query<
        { canal: string; motivo_revocacion: string | null }[]
      >(
        'SELECT canal, motivo_revocacion FROM sesiones ORDER BY fecha_creacion',
      );
      expect(filas).toEqual([
        { canal: 'APP', motivo_revocacion: 'ROTADA' },
        { canal: 'APP', motivo_revocacion: null },
      ]);
    });

    it('un token de renovación usado dos veces es rechazado y se revoca toda la familia', async () => {
      const inicial = await registrarEIngresar();
      const renovada = (await renovar(inicial.tokenRenovacion).expect(200))
        .body as CuerpoSesion;

      const reutilizado = await renovar(inicial.tokenRenovacion).expect(401);

      expect(reutilizado.body).toEqual({
        codigo: 'TOKEN_INVALIDO',
        mensaje: 'La sesión no es válida. Inicie sesión de nuevo.',
        detalles: {},
      });
      expect(await sesionesVigentes()).toBe(0);
      // El token legítimo más reciente tampoco sirve: hay que volver a ingresar.
      await renovar(renovada.tokenRenovacion).expect(401);
    });

    it('un token inexistente → 401 TOKEN_INVALIDO; sin token → 400', async () => {
      const respuesta = await renovar('token-que-no-existe').expect(401);
      expect(respuesta.body.codigo).toBe('TOKEN_INVALIDO');

      await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({})
        .expect(400);
    });
  });

  describe('POST /api/v1/autenticacion/salida (D-09)', () => {
    it('revoca la sesión: después el token de renovación ya no sirve', async () => {
      const sesion = await registrarEIngresar();

      const respuesta = await salir(
        sesion.tokenAcceso,
        sesion.tokenRenovacion,
      ).expect(204);

      expect(respuesta.text).toBe('');
      expect(await sesionesVigentes()).toBe(0);
      const renovacion = await renovar(sesion.tokenRenovacion).expect(401);
      expect(renovacion.body.codigo).toBe('TOKEN_INVALIDO');
    });

    it('es idempotente: repetir la salida responde 204', async () => {
      const sesion = await registrarEIngresar();
      await salir(sesion.tokenAcceso, sesion.tokenRenovacion).expect(204);

      await salir(sesion.tokenAcceso, sesion.tokenRenovacion).expect(204);
    });

    it('sin token de acceso → 401 NO_AUTENTICADO y no revoca nada', async () => {
      const sesion = await registrarEIngresar();

      const respuesta = await salir(null, sesion.tokenRenovacion).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
      expect(await sesionesVigentes()).toBe(1);
    });

    it('con un token de acceso vencido → 401 TOKEN_VENCIDO y no revoca nada', async () => {
      const sesion = await registrarEIngresar();
      const haceUnaHora = Math.floor(Date.now() / 1000) - 3600;
      const vencido = await contexto.app
        .get(JwtService, { strict: false })
        .signAsync(
          { sub: sesion.usuario.id, rol: 'CLIENTE', iat: haceUnaHora },
          { expiresIn: 900 },
        );

      const respuesta = await salir(vencido, sesion.tokenRenovacion).expect(
        401,
      );

      expect(respuesta.body.codigo).toBe('TOKEN_VENCIDO');
      expect(await sesionesVigentes()).toBe(1);
    });

    it('con un token de acceso alterado → 401 NO_AUTENTICADO', async () => {
      const sesion = await registrarEIngresar();
      const [cabecera, contenido] = sesion.tokenAcceso.split('.');

      const respuesta = await salir(
        `${cabecera}.${contenido}.firmaFalsa`,
        sesion.tokenRenovacion,
      ).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
      expect(await sesionesVigentes()).toBe(1);
    });
  });

  describe('D-17: límite de intentos por IP', () => {
    it('el sexto ingreso en un minuto (sumando las dos rutas) → 429 con Retry-After', async () => {
      await registrar().expect(201);
      for (let intento = 1; intento <= 5; intento++) {
        const canal = intento % 2 === 0 ? 'vendedor' : 'cliente';
        await ingresar(canal, REGISTRO_VALIDO.correo, 'Mala2026').expect(401);
      }

      const respuesta = await ingresar(
        'cliente',
        REGISTRO_VALIDO.correo,
        CLAVE,
      ).expect(429);

      expect(respuesta.body).toEqual({
        codigo: 'DEMASIADAS_SOLICITUDES',
        mensaje: 'Demasiados intentos. Espere un momento e inténtelo de nuevo.',
        detalles: { reintentarEnSegundos: expect.any(Number) as unknown },
      });
      const segundos = Number(respuesta.headers['retry-after']);
      expect(segundos).toBeGreaterThan(0);
      expect(segundos).toBeLessThanOrEqual(60);
      expect(respuesta.body.detalles.reintentarEnSegundos).toBe(segundos);
      // El bloqueo ocurre antes de verificar credenciales: no hay sesión.
      expect(await contar('sesiones')).toBe(0);
    });

    it('el cuarto registro en un minuto → 429 y no se crea', async () => {
      for (let i = 1; i <= 3; i++) {
        await registrar({
          ...REGISTRO_VALIDO,
          correo: `cliente${i}@ejemplo.test`,
        }).expect(201);
      }

      await registrar({
        ...REGISTRO_VALIDO,
        correo: 'cliente4@ejemplo.test',
      }).expect(429);

      expect(await contar('usuarios')).toBe(3);
    });

    it('las rutas sin límite (aviso de privacidad) no se bloquean', async () => {
      for (let i = 0; i < 12; i++) {
        await http().get('/api/v1/privacidad/aviso').expect(200);
      }
    });
  });
});
