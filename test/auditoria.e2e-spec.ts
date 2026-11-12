import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../src/compartido/aplicacion/unidad-trabajo.puerto.js';
import {
  REGISTRO_ACTIVIDAD_REPOSITORIO,
  type RegistroActividadRepositorio,
} from '../src/modulos/auditoria/aplicacion/puertos/registro-actividad.repositorio.js';
import {
  SERVICIO_AUDITORIA,
  type ServicioAuditoria,
} from '../src/modulos/auditoria/index.js';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la subfase 1.5 (RF-USU-04, RF-USU-03, CA-02, D-18, D-19, D-20)
 * contra `catalogostock_pruebas` (D-23): cada acción deja su registro, la
 * bitácora nunca guarda datos prohibidos y `GET /api/v1/auditoria` es la ruta
 * administrativa real de CA-02. Datos ficticios.
 */

const RUTA = '/api/v1/auditoria';
const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const NOMBRE_VENDEDOR = 'Vendedor de Prueba';

const REGISTRO_MARIA = {
  nombre: 'María Zambrano',
  correo: 'Maria.Zambrano@Ejemplo.test',
  telefono: '0991234567',
  clave: CLAVE,
  aceptaPrivacidad: true,
  versionPrivacidad: VERSION_AVISO,
};
const CORREO_MARIA = 'maria.zambrano@ejemplo.test';

const CREDENCIALES_INVALIDAS = {
  codigo: 'CREDENCIALES_INVALIDAS',
  mensaje: 'Correo o clave incorrectos.',
  detalles: {},
};

const NO_AUTORIZADO = {
  codigo: 'NO_AUTORIZADO',
  mensaje: 'No tiene permiso para realizar esta acción.',
  detalles: {},
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface CuerpoSesion {
  tokenAcceso: string;
  tokenRenovacion: string;
  usuario: { id: string; rol: string };
}

interface FilaAuditoria {
  id: string;
  fecha: Date;
  accion: string;
  id_usuario: string | null;
  entidad: string | null;
  id_entidad: string | null;
  detalle: Record<string, unknown>;
}

interface ElementoBitacora {
  id: string;
  fecha: string;
  accion: string;
  usuario: { id: string; nombre: string; rol: string | null } | null;
  entidad: string | null;
  idEntidad: string | null;
  detalle: Record<string, unknown>;
}

interface PaginaBitacora {
  elementos: ElementoBitacora[];
  pagina: number;
  tamanio: number;
  total: number;
}

function conToken<T extends { set(campo: string, valor: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

describe('Subfase 1.5 (e2e): bitácora de actividades (RF-USU-04)', () => {
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

  async function crearVendedor(): Promise<string> {
    const resultado = await contexto.app.get(CrearVendedorCasoUso).ejecutar({
      nombre: NOMBRE_VENDEDOR,
      correo: CORREO_VENDEDOR,
      telefono: '0987654321',
      clave: CLAVE_VENDEDOR,
    });
    if (!resultado.creado) {
      throw new Error('No se creó el Vendedor de prueba');
    }
    return resultado.idUsuario;
  }

  async function registrarMaria(): Promise<string> {
    const respuesta = await http()
      .post('/api/v1/usuarios/registro')
      .send(REGISTRO_MARIA)
      .expect(201);
    return (respuesta.body as { id: string }).id;
  }

  async function sesionCliente(): Promise<CuerpoSesion> {
    await registrarMaria();
    const respuesta = await ingresar('cliente', CORREO_MARIA, CLAVE).expect(
      200,
    );
    return respuesta.body as CuerpoSesion;
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

  async function filas(accion?: string): Promise<FilaAuditoria[]> {
    return accion === undefined
      ? contexto.fuente.query<FilaAuditoria[]>(
          'SELECT * FROM auditoria ORDER BY fecha, id',
        )
      : contexto.fuente.query<FilaAuditoria[]>(
          'SELECT * FROM auditoria WHERE accion = $1 ORDER BY fecha, id',
          [accion],
        );
  }

  async function idSesionDe(idUsuario: string): Promise<string> {
    const [fila] = await contexto.fuente.query<{ id: string }[]>(
      'SELECT id FROM sesiones WHERE id_usuario = $1 ORDER BY fecha_creacion DESC LIMIT 1',
      [idUsuario],
    );
    return fila.id;
  }

  /** Copia de todas las tablas salvo `auditoria`, para comprobar que nada cambió (CA-02). */
  async function instantaneaSinBitacora(): Promise<unknown> {
    const usuarios = await contexto.fuente.query(
      'SELECT * FROM usuarios ORDER BY id',
    );
    const sesiones = await contexto.fuente.query(
      'SELECT * FROM sesiones ORDER BY id',
    );
    return { usuarios, sesiones };
  }

  /** Ningún registro contiene claves, hashes, tokens ni teléfonos (contrato, «Reglas»). */
  async function comprobarSinDatosProhibidos(
    secretos: readonly string[],
  ): Promise<void> {
    const texto = JSON.stringify(await filas());
    for (const secreto of [CLAVE, CLAVE_VENDEDOR, ...secretos]) {
      expect(texto).not.toContain(secreto);
    }
    expect(texto).not.toMatch(/\$2[aby]\$/);
    expect(texto).not.toMatch(/eyJ[\w-]+\./);
    expect(texto).not.toContain('0991234567');
    expect(texto).not.toContain('+593');
    expect(texto).not.toContain('María');
  }

  const consultar = (token: string, consulta = '') =>
    conToken(http().get(`${RUTA}${consulta}`), token);

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  beforeEach(async () => {
    await contexto.limpiar();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('RF-USU-04: cada acción deja su registro con los campos del contrato', () => {
    it('VENDEDOR_CREADO (comando semilla) con origen COMANDO_SEMILLA', async () => {
      const idVendedor = await crearVendedor();

      const [fila] = await filas();
      expect(fila).toMatchObject({
        accion: 'VENDEDOR_CREADO',
        id_usuario: idVendedor,
        entidad: 'USUARIO',
        id_entidad: idVendedor,
        detalle: { origen: 'COMANDO_SEMILLA' },
      });
      expect(fila.id).toMatch(UUID);
      expect(Math.abs(fila.fecha.getTime() - Date.now())).toBeLessThan(60_000);
      await comprobarSinDatosProhibidos([]);
    });

    it('USUARIO_REGISTRADO con { rol: CLIENTE } y el usuario como entidad', async () => {
      const idMaria = await registrarMaria();

      expect(await filas()).toEqual([
        expect.objectContaining({
          accion: 'USUARIO_REGISTRADO',
          id_usuario: idMaria,
          entidad: 'USUARIO',
          id_entidad: idMaria,
          detalle: { rol: 'CLIENTE' },
        }),
      ]);
      await comprobarSinDatosProhibidos([]);
    });

    it('SESION_INICIADA con { rol, canal } y la sesión creada, en la app y en el panel (D-19)', async () => {
      const cliente = await sesionCliente();
      const vendedor = await sesionVendedor();

      const iniciadas = await filas('SESION_INICIADA');
      expect(iniciadas).toEqual([
        expect.objectContaining({
          id_usuario: cliente.usuario.id,
          entidad: 'SESION',
          id_entidad: await idSesionDe(cliente.usuario.id),
          detalle: { rol: 'CLIENTE', canal: 'APP' },
        }),
        expect.objectContaining({
          id_usuario: vendedor.usuario.id,
          entidad: 'SESION',
          id_entidad: await idSesionDe(vendedor.usuario.id),
          detalle: { rol: 'VENDEDOR', canal: 'PANEL' },
        }),
      ]);
      await comprobarSinDatosProhibidos([
        cliente.tokenAcceso,
        cliente.tokenRenovacion,
        vendedor.tokenAcceso,
        vendedor.tokenRenovacion,
      ]);
    });

    it('SESION_CERRADA al salir, con la sesión del token y detalle {}', async () => {
      const cliente = await sesionCliente();

      await conToken(
        http().post('/api/v1/autenticacion/salida'),
        cliente.tokenAcceso,
      )
        .send({ tokenRenovacion: cliente.tokenRenovacion })
        .expect(204);
      // Repetir la salida es idempotente y no deja otro registro.
      await conToken(
        http().post('/api/v1/autenticacion/salida'),
        cliente.tokenAcceso,
      )
        .send({ tokenRenovacion: cliente.tokenRenovacion })
        .expect(204);

      expect(await filas('SESION_CERRADA')).toEqual([
        expect.objectContaining({
          id_usuario: cliente.usuario.id,
          entidad: 'SESION',
          id_entidad: await idSesionDe(cliente.usuario.id),
          detalle: {},
        }),
      ]);
      await comprobarSinDatosProhibidos([
        cliente.tokenAcceso,
        cliente.tokenRenovacion,
      ]);
    });

    it('SESION_REUTILIZACION_DETECTADA al reutilizar un token ya rotado; una renovación normal no deja registro', async () => {
      const cliente = await sesionCliente();
      const idSesionInicial = await idSesionDe(cliente.usuario.id);

      await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({ tokenRenovacion: cliente.tokenRenovacion })
        .expect(200);
      expect(await filas('SESION_REUTILIZACION_DETECTADA')).toHaveLength(0);

      await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({ tokenRenovacion: cliente.tokenRenovacion })
        .expect(401);

      expect(await filas('SESION_REUTILIZACION_DETECTADA')).toEqual([
        expect.objectContaining({
          id_usuario: cliente.usuario.id,
          entidad: 'SESION',
          id_entidad: idSesionInicial,
          detalle: { familiaRevocada: true },
        }),
      ]);
      await comprobarSinDatosProhibidos([cliente.tokenRenovacion]);
    });
  });

  describe('Decisión 1.5: un token reutilizado se revoca siempre', () => {
    it('con la bitácora fallando, el token reutilizado → 401 TOKEN_INVALIDO (nunca 500) y todas las sesiones de la cadena quedan revocadas', async () => {
      const cliente = await sesionCliente();
      const rotada = await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({ tokenRenovacion: cliente.tokenRenovacion })
        .expect(200);
      const repositorio = contexto.app.get<RegistroActividadRepositorio>(
        REGISTRO_ACTIVIDAD_REPOSITORIO,
        { strict: false },
      );
      vi.spyOn(repositorio, 'guardar').mockRejectedValue(
        new Error('bitácora no disponible'),
      );
      vi.spyOn(repositorio, 'guardarFueraDeTransaccion').mockRejectedValue(
        new Error('bitácora no disponible'),
      );

      const respuesta = await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({ tokenRenovacion: cliente.tokenRenovacion });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.codigo).toBe('TOKEN_INVALIDO');
      const cadena = await contexto.fuente.query<
        { motivo_revocacion: string | null }[]
      >(
        'SELECT motivo_revocacion FROM sesiones WHERE id_usuario = $1 ORDER BY fecha_creacion',
        [cliente.usuario.id],
      );
      expect(cadena.map((s) => s.motivo_revocacion)).toEqual([
        'ROTADA',
        'REUTILIZACION',
      ]);
      expect(await filas('SESION_REUTILIZACION_DETECTADA')).toHaveLength(0);

      // El token legítimo más reciente de la cadena tampoco sirve.
      vi.restoreAllMocks();
      await http()
        .post('/api/v1/autenticacion/renovacion')
        .send({
          tokenRenovacion: (rotada.body as CuerpoSesion).tokenRenovacion,
        })
        .expect(401);
    });
  });

  describe('D-20: ingresos fallidos (SESION_FALLIDA)', () => {
    it('clave incorrecta → mismo 401; guarda el correo intentado en minúsculas, el canal, el motivo y el usuario; nunca la clave', async () => {
      const idMaria = await registrarMaria();

      const respuesta = await ingresar(
        'cliente',
        '  MARIA.Zambrano@EJEMPLO.test ',
        'ClaveIntentada99',
      ).expect(401);

      expect(respuesta.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await filas('SESION_FALLIDA')).toEqual([
        expect.objectContaining({
          id_usuario: idMaria,
          entidad: 'SESION',
          id_entidad: null,
          detalle: {
            correo: CORREO_MARIA,
            canal: 'APP',
            motivo: 'CREDENCIALES_INVALIDAS',
          },
        }),
      ]);
      await comprobarSinDatosProhibidos(['ClaveIntentada99']);
    });

    it('correo inexistente → mismo 401 y registro sin usuario (usuario null)', async () => {
      const respuesta = await ingresar(
        'vendedor',
        'Nadie@Ejemplo.test',
        'ClaveIntentada99',
      ).expect(401);

      expect(respuesta.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await filas('SESION_FALLIDA')).toEqual([
        expect.objectContaining({
          id_usuario: null,
          detalle: {
            correo: 'nadie@ejemplo.test',
            canal: 'PANEL',
            motivo: 'CREDENCIALES_INVALIDAS',
          },
        }),
      ]);
      await comprobarSinDatosProhibidos(['ClaveIntentada99']);
    });

    it('D-19: un Vendedor en /ingreso/cliente y un Cliente en /ingreso/vendedor → mismo 401, sin sesión y motivo ROL_NO_PERMITIDO', async () => {
      const idVendedor = await crearVendedor();
      const idMaria = await registrarMaria();

      const vendedorEnApp = await ingresar(
        'cliente',
        CORREO_VENDEDOR,
        CLAVE_VENDEDOR,
      ).expect(401);
      const clienteEnPanel = await ingresar(
        'vendedor',
        CORREO_MARIA,
        CLAVE,
      ).expect(401);

      expect(vendedorEnApp.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(clienteEnPanel.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(
        await contexto.fuente.query('SELECT id FROM sesiones'),
      ).toHaveLength(0);
      expect(await filas('SESION_FALLIDA')).toEqual([
        expect.objectContaining({
          id_usuario: idVendedor,
          detalle: {
            correo: CORREO_VENDEDOR,
            canal: 'APP',
            motivo: 'ROL_NO_PERMITIDO',
          },
        }),
        expect.objectContaining({
          id_usuario: idMaria,
          detalle: {
            correo: CORREO_MARIA,
            canal: 'PANEL',
            motivo: 'ROL_NO_PERMITIDO',
          },
        }),
      ]);
      await comprobarSinDatosProhibidos([]);
    });

    it('si la bitácora falla en un ingreso fallido, la respuesta es el mismo 401 sin información extra', async () => {
      await registrarMaria();
      const repositorio = contexto.app.get<RegistroActividadRepositorio>(
        REGISTRO_ACTIVIDAD_REPOSITORIO,
        { strict: false },
      );
      vi.spyOn(repositorio, 'guardarFueraDeTransaccion').mockRejectedValue(
        new Error('bitácora no disponible'),
      );

      const respuesta = await ingresar('cliente', CORREO_MARIA, 'Mala2026');

      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await filas('SESION_FALLIDA')).toHaveLength(0);
    });
  });

  describe('Base de CA-03: la operación y su registro van en la misma transacción', () => {
    it('si el registro de la bitácora falla, el registro del Cliente no se guarda', async () => {
      const repositorio = contexto.app.get<RegistroActividadRepositorio>(
        REGISTRO_ACTIVIDAD_REPOSITORIO,
        { strict: false },
      );
      vi.spyOn(repositorio, 'guardar').mockRejectedValueOnce(
        new Error('bitácora no disponible'),
      );

      const respuesta = await http()
        .post('/api/v1/usuarios/registro')
        .send(REGISTRO_MARIA)
        .expect(500);

      expect(respuesta.body.codigo).toBe('ERROR_INTERNO');
      expect(await contexto.fuente.query('SELECT id FROM usuarios')).toEqual(
        [],
      );
      expect(await filas()).toEqual([]);
    });

    it('registrar dentro de una transacción que falla no deja registro; si se confirma, sí', async () => {
      const unidad = contexto.app.get<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO, {
        strict: false,
      });
      const auditoria = contexto.app.get<ServicioAuditoria>(
        SERVICIO_AUDITORIA,
        { strict: false },
      );
      const actividad = {
        accion: 'ACCESO_DENEGADO' as const,
        idUsuario: null,
        entidad: null,
        idEntidad: null,
        detalle: { metodo: 'GET', ruta: RUTA, rolUsuario: 'CLIENTE' },
      };

      await expect(
        unidad.ejecutar(async () => {
          await auditoria.registrar(actividad);
          throw new Error('la operación auditada falla');
        }),
      ).rejects.toThrow('la operación auditada falla');
      expect(await filas()).toEqual([]);

      await unidad.ejecutar(() => auditoria.registrar(actividad));
      expect(await filas()).toHaveLength(1);
    });
  });

  describe('CA-02: GET /api/v1/auditoria es solo del Vendedor', () => {
    it('Dado una sesión con rol Cliente, cuando consulta la bitácora, entonces 403 NO_AUTORIZADO, se registra ACCESO_DENEGADO y no se modifica ningún otro dato', async () => {
      const cliente = await sesionCliente();
      await sesionVendedor();
      const antes = await instantaneaSinBitacora();
      const registrosAntes = await filas();

      const respuesta = await consultar(
        cliente.tokenAcceso,
        '?pagina=1&accion=SESION_FALLIDA',
      ).expect(403);

      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      expect(await instantaneaSinBitacora()).toEqual(antes);
      const nuevos = (await filas()).slice(registrosAntes.length);
      expect(nuevos).toEqual([
        expect.objectContaining({
          accion: 'ACCESO_DENEGADO',
          id_usuario: cliente.usuario.id,
          entidad: null,
          id_entidad: null,
          // La ruta sin parámetros de consulta (contrato).
          detalle: { metodo: 'GET', ruta: RUTA, rolUsuario: 'CLIENTE' },
        }),
      ]);
      await comprobarSinDatosProhibidos([
        cliente.tokenAcceso,
        cliente.tokenRenovacion,
      ]);
    });

    it('el guard de roles va antes que la validación: un Cliente con parámetros inválidos también recibe 403', async () => {
      const cliente = await sesionCliente();

      await consultar(cliente.tokenAcceso, '?pagina=0&otro=1').expect(403);

      expect(await filas('ACCESO_DENEGADO')).toHaveLength(1);
    });

    it('el Vendedor ve el ACCESO_DENEGADO del Cliente en la bitácora', async () => {
      const cliente = await sesionCliente();
      const vendedor = await sesionVendedor();
      await consultar(cliente.tokenAcceso).expect(403);

      const respuesta = await consultar(
        vendedor.tokenAcceso,
        '?accion=ACCESO_DENEGADO',
      ).expect(200);

      expect((respuesta.body as PaginaBitacora).elementos).toEqual([
        expect.objectContaining({
          accion: 'ACCESO_DENEGADO',
          usuario: {
            id: cliente.usuario.id,
            nombre: REGISTRO_MARIA.nombre,
            rol: 'CLIENTE',
          },
          entidad: null,
          idEntidad: null,
          detalle: { metodo: 'GET', ruta: RUTA, rolUsuario: 'CLIENTE' },
        }),
      ]);
    });

    it('sin token → 401 NO_AUTENTICADO y no se registra nada', async () => {
      const respuesta = await http().get(RUTA).expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
      expect(await filas()).toEqual([]);
    });

    it('token vencido → 401 TOKEN_VENCIDO y no se registra nada', async () => {
      const idVendedor = await crearVendedor();
      const registrosAntes = await filas();
      const haceUnaHora = Math.floor(Date.now() / 1000) - 3600;
      const vencido = await contexto.app
        .get(JwtService, { strict: false })
        .signAsync(
          { sub: idVendedor, rol: 'VENDEDOR', iat: haceUnaHora },
          { expiresIn: 900 },
        );

      const respuesta = await consultar(vencido).expect(401);

      expect(respuesta.body.codigo).toBe('TOKEN_VENCIDO');
      expect(await filas()).toEqual(registrosAntes);
    });

    it('no existen rutas para editar ni borrar registros', async () => {
      const vendedor = await sesionVendedor();
      const [registro] = await filas();

      for (const metodo of ['post', 'put', 'patch', 'delete'] as const) {
        await conToken(http()[metodo](RUTA), vendedor.tokenAcceso).expect(404);
        await conToken(
          http()[metodo](`${RUTA}/${registro.id}`),
          vendedor.tokenAcceso,
        ).expect(404);
      }
    });
  });

  /**
   * Prepara 7 registros, en este orden: VENDEDOR_CREADO, SESION_INICIADA
   * (Vendedor), USUARIO_REGISTRADO, SESION_INICIADA (Cliente),
   * SESION_FALLIDA (sin usuario), SESION_INICIADA (Vendedor otra vez) y
   * SESION_CERRADA (Cliente). Usa 4 de los 5 ingresos por minuto (D-17).
   */
  async function prepararBitacora() {
    await sesionVendedor();
    const cliente = await sesionCliente();
    await ingresar('cliente', 'nadie@ejemplo.test', 'Mala2026').expect(401);
    const segunda = await ingresar(
      'vendedor',
      CORREO_VENDEDOR,
      CLAVE_VENDEDOR,
    ).expect(200);
    await conToken(
      http().post('/api/v1/autenticacion/salida'),
      cliente.tokenAcceso,
    )
      .send({ tokenRenovacion: cliente.tokenRenovacion })
      .expect(204);
    return { vendedor: segunda.body as CuerpoSesion, cliente };
  }

  describe('GET /api/v1/auditoria con el Vendedor: formato, orden, paginación y filtros', () => {
    it('devuelve el formato de paginación del contrato, lo más reciente primero, con { id, nombre, rol } del usuario', async () => {
      const { vendedor, cliente } = await prepararBitacora();

      const respuesta = await consultar(vendedor.tokenAcceso).expect(200);
      const pagina = respuesta.body as PaginaBitacora;

      expect(Object.keys(pagina).toSorted()).toEqual([
        'elementos',
        'pagina',
        'tamanio',
        'total',
      ]);
      expect(pagina).toMatchObject({ pagina: 1, tamanio: 20, total: 7 });
      expect(pagina.elementos.map((e) => e.accion)).toEqual([
        'SESION_CERRADA',
        'SESION_INICIADA',
        'SESION_FALLIDA',
        'SESION_INICIADA',
        'USUARIO_REGISTRADO',
        'SESION_INICIADA',
        'VENDEDOR_CREADO',
      ]);
      const fechas = pagina.elementos.map((e) => Date.parse(e.fecha));
      expect(fechas).toEqual(fechas.toSorted((a, b) => b - a));

      const [cerrada] = pagina.elementos;
      expect(Object.keys(cerrada).toSorted()).toEqual([
        'accion',
        'detalle',
        'entidad',
        'fecha',
        'id',
        'idEntidad',
        'usuario',
      ]);
      expect(cerrada).toMatchObject({
        accion: 'SESION_CERRADA',
        usuario: {
          id: cliente.usuario.id,
          nombre: REGISTRO_MARIA.nombre,
          rol: 'CLIENTE',
        },
        entidad: 'SESION',
        idEntidad: await idSesionDe(cliente.usuario.id),
        detalle: {},
      });
      expect(cerrada.id).toMatch(UUID);
      expect(cerrada.fecha).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );

      const fallida = pagina.elementos[2];
      expect(fallida.usuario).toBeNull();
      expect(fallida.detalle).toEqual({
        correo: 'nadie@ejemplo.test',
        canal: 'APP',
        motivo: 'CREDENCIALES_INVALIDAS',
      });
      expect(pagina.elementos.at(-1)?.usuario).toEqual({
        id: vendedor.usuario.id,
        nombre: NOMBRE_VENDEDOR,
        rol: 'VENDEDOR',
      });
      // Nunca claves, hashes ni tokens en la respuesta.
      const texto = JSON.stringify(pagina);
      expect(texto).not.toContain(CLAVE);
      expect(texto).not.toContain(CLAVE_VENDEDOR);
      expect(texto).not.toMatch(/\$2[aby]\$/);
      expect(texto).not.toContain(vendedor.tokenAcceso);
      expect(texto).not.toContain(cliente.tokenRenovacion);
      expect(texto).not.toContain('+593');
    });

    it('pagina y tamanio: páginas sin solapes y total de todos los registros', async () => {
      const { vendedor } = await prepararBitacora();

      const paginas: PaginaBitacora[] = [];
      for (const numero of [1, 2, 3, 4]) {
        const respuesta = await consultar(
          vendedor.tokenAcceso,
          `?pagina=${numero}&tamanio=2`,
        ).expect(200);
        paginas.push(respuesta.body as PaginaBitacora);
      }

      expect(paginas.map((p) => p.elementos.length)).toEqual([2, 2, 2, 1]);
      expect(paginas.every((p) => p.total === 7 && p.tamanio === 2)).toBe(true);
      expect(paginas.map((p) => p.pagina)).toEqual([1, 2, 3, 4]);
      const ids = paginas.flatMap((p) => p.elementos.map((e) => e.id));
      expect(new Set(ids).size).toBe(7);

      const vacia = await consultar(
        vendedor.tokenAcceso,
        '?pagina=9&tamanio=100',
      ).expect(200);
      expect(vacia.body).toEqual({
        elementos: [],
        pagina: 9,
        tamanio: 100,
        total: 7,
      });
    });

    it('filtra por acción, usuario, entidad e idEntidad', async () => {
      const { vendedor, cliente } = await prepararBitacora();
      const idSesionCliente = await idSesionDe(cliente.usuario.id);

      const porAccion = await consultar(
        vendedor.tokenAcceso,
        '?accion=SESION_INICIADA',
      ).expect(200);
      expect((porAccion.body as PaginaBitacora).total).toBe(3);
      expect(
        (porAccion.body as PaginaBitacora).elementos.every(
          (e) => e.accion === 'SESION_INICIADA',
        ),
      ).toBe(true);

      const porUsuario = await consultar(
        vendedor.tokenAcceso,
        `?idUsuario=${cliente.usuario.id}`,
      ).expect(200);
      expect(
        (porUsuario.body as PaginaBitacora).elementos.map((e) => e.accion),
      ).toEqual(['SESION_CERRADA', 'SESION_INICIADA', 'USUARIO_REGISTRADO']);

      const porEntidad = await consultar(
        vendedor.tokenAcceso,
        '?entidad=USUARIO',
      ).expect(200);
      expect(
        (porEntidad.body as PaginaBitacora).elementos.map((e) => e.accion),
      ).toEqual(['USUARIO_REGISTRADO', 'VENDEDOR_CREADO']);

      const historial = await consultar(
        vendedor.tokenAcceso,
        `?entidad=SESION&idEntidad=${idSesionCliente}`,
      ).expect(200);
      expect(
        (historial.body as PaginaBitacora).elementos.map((e) => e.accion),
      ).toEqual(['SESION_CERRADA', 'SESION_INICIADA']);

      const combinado = await consultar(
        vendedor.tokenAcceso,
        `?accion=SESION_INICIADA&idUsuario=${cliente.usuario.id}&tamanio=1`,
      ).expect(200);
      expect(combinado.body).toMatchObject({ total: 1, tamanio: 1 });
    });

    it('filtra por fecha: desde y hasta son inclusivos y aceptan zona horaria', async () => {
      const { vendedor } = await prepararBitacora();
      const todas = await filas();
      const tercera = todas[2].fecha;
      const quinta = todas[4].fecha;
      const desde = encodeURIComponent(tercera.toISOString());
      const hasta = encodeURIComponent(quinta.toISOString());

      const rango = await consultar(
        vendedor.tokenAcceso,
        `?desde=${desde}&hasta=${hasta}`,
      ).expect(200);
      expect((rango.body as PaginaBitacora).elementos.map((e) => e.id)).toEqual(
        [todas[4].id, todas[3].id, todas[2].id],
      );

      const soloDesde = await consultar(
        vendedor.tokenAcceso,
        `?desde=${encodeURIComponent(todas[6].fecha.toISOString())}`,
      ).expect(200);
      expect((soloDesde.body as PaginaBitacora).total).toBe(1);

      const soloHasta = await consultar(
        vendedor.tokenAcceso,
        `?hasta=${encodeURIComponent(todas[0].fecha.toISOString())}`,
      ).expect(200);
      expect((soloHasta.body as PaginaBitacora).total).toBe(1);

      // Misma hora expresada en Ecuador (-05:00): mismo resultado.
      const enEcuador = new Date(quinta.getTime() - 5 * 3600_000)
        .toISOString()
        .replace('Z', '-05:00');
      const conZona = await consultar(
        vendedor.tokenAcceso,
        `?desde=${desde}&hasta=${encodeURIComponent(enEcuador)}`,
      ).expect(200);
      expect((conZona.body as PaginaBitacora).total).toBe(3);

      const futuro = await consultar(
        vendedor.tokenAcceso,
        '?desde=2099-01-01T00:00:00Z',
      ).expect(200);
      expect(futuro.body).toMatchObject({ elementos: [], total: 0 });
    });

    it.each([
      ['pagina=0', 'pagina'],
      ['pagina=abc', 'pagina'],
      ['pagina=1.5', 'pagina'],
      ['pagina=1e1', 'pagina'],
      ['pagina=', 'pagina'],
      ['pagina=1&pagina=2', 'pagina'],
      ['tamanio=0', 'tamanio'],
      ['tamanio=101', 'tamanio'],
      ['accion=DESCONOCIDA', 'accion'],
      ['accion=sesion_fallida', 'accion'],
      ['idUsuario=no-es-uuid', 'idUsuario'],
      ['entidad=LIBRO', 'entidad'],
      ['idEntidad=123', 'idEntidad'],
      ['desde=2026-11-05', 'desde'],
      ['desde=ayer', 'desde'],
      ['hasta=2026-02-30T00:00:00Z', 'hasta'],
      ['hasta=2026-11-05T10:00:00', 'hasta'],
      [
        'desde=2026-11-06T00:00:00-05:00&hasta=2026-11-05T23:59:59-05:00',
        'hasta',
      ],
      ['orden=fecha', 'orden'],
    ])(
      'RNF-03: ?%s → 400 DATOS_INVALIDOS en «%s» sin repetir el valor',
      async (consulta, campo) => {
        const vendedor = await sesionVendedor();
        const registrosAntes = await filas();

        const respuesta = await consultar(
          vendedor.tokenAcceso,
          `?${consulta}`,
        ).expect(400);

        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
        expect(respuesta.body.mensaje).toBe(
          'Los datos enviados no son válidos.',
        );
        const errores = respuesta.body.detalles.errores as { campo: string }[];
        expect(errores.map((e) => e.campo)).toContain(campo);
        expect(JSON.stringify(respuesta.body)).not.toContain('no-es-uuid');
        expect(await filas()).toEqual(registrosAntes);
      },
    );
  });
});
