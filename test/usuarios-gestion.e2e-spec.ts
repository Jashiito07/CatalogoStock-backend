import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import {
  type AlmacenLimiteReiniciable,
  type AppPruebas,
  crearAppPruebas,
} from './preparacion/app-pruebas.js';

/**
 * e2e del contrato usuarios-gestion (D-52, D-53, RF-USU-01, RF-USU-03, CA-02)
 * contra `catalogostock_pruebas` (D-23): mensajes de ingreso de la app y
 * desactivar / reactivar clientes. Datos ficticios; el correo es un doble.
 */

const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const CORREO_MARIA = 'maria.zambrano@ejemplo.test';
const CORREO_LUIS = 'luis.mera@ejemplo.test';
const ID_INEXISTENTE = '00000000-0000-4000-8000-0000000000aa';

const CREDENCIALES_INVALIDAS = {
  codigo: 'CREDENCIALES_INVALIDAS',
  mensaje: 'Correo o clave incorrectos.',
  detalles: {},
};

const CORREO_NO_REGISTRADO = {
  codigo: 'CORREO_NO_REGISTRADO',
  mensaje: 'No existe una cuenta registrada con ese correo.',
  detalles: {},
};

const CUENTA_DESACTIVADA = {
  codigo: 'CUENTA_DESACTIVADA',
  mensaje: 'Tu cuenta está desactivada. Contacta a tu vendedor.',
  detalles: {},
};

interface CuerpoSesion {
  tokenAcceso: string;
  tokenRenovacion: string;
  usuario: { id: string; rol: string; activo: boolean };
}

interface FilaAuditoria {
  accion: string;
  id_usuario: string | null;
  entidad: string | null;
  id_entidad: string | null;
  detalle: Record<string, unknown>;
}

/** `{ id: activo }` de los elementos de una página de `GET /usuarios`. */
/** Mapa id → correoVerificadoEn de una página de la lista de clientes. */
function verificacion(cuerpo: {
  elementos: { id: string; correoVerificadoEn: string | null }[];
}): Record<string, string | null> {
  return Object.fromEntries(
    cuerpo.elementos.map((e) => [e.id, e.correoVerificadoEn]),
  );
}

function estado(cuerpo: {
  elementos: { id: string; activo: boolean }[];
}): Record<string, boolean> {
  return Object.fromEntries(
    cuerpo.elementos.map((elemento) => [elemento.id, elemento.activo]),
  );
}

describe('Usuarios, gestión (e2e): mensajes de ingreso y estado de los clientes (D-52, D-53)', () => {
  let contexto: AppPruebas;
  let idMaria: string;
  let idLuis: string;
  let idVendedor: string;

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

  const cambiarEstado = (token: string, id: string, cuerpo: unknown) =>
    http()
      .patch(`/api/v1/usuarios/${id}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo as object);

  /** Reinicia el límite de intentos por IP (5 por minuto) sin vaciar las tablas. */
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
    clave: string,
  ): Promise<CuerpoSesion> {
    const respuesta = await ingresar(canal, correo, clave).expect(200);
    return respuesta.body as CuerpoSesion;
  }

  async function auditoria(accion: string): Promise<FilaAuditoria[]> {
    return contexto.fuente.query<FilaAuditoria[]>(
      `SELECT accion, id_usuario, entidad, id_entidad, detalle FROM auditoria
       WHERE accion = $1 ORDER BY fecha, id`,
      [accion],
    );
  }

  async function contar(tabla: 'usuarios' | 'sesiones'): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM ${tabla}`,
    );
    return Number(total);
  }

  async function sesionesVigentesDe(id: string): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM sesiones
       WHERE id_usuario = $1 AND fecha_revocacion IS NULL AND fecha_vencimiento > now()`,
      [id],
    );
    return Number(total);
  }

  async function activoEnBase(id: string): Promise<boolean> {
    const [fila] = await contexto.fuente.query<{ activo: boolean }[]>(
      'SELECT activo FROM usuarios WHERE id = $1',
      [id],
    );
    return fila.activo;
  }

  async function sesionVendedor(): Promise<CuerpoSesion> {
    return sesion('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR);
  }

  beforeAll(async () => {
    contexto = await crearAppPruebas();
  });

  beforeEach(async () => {
    await contexto.limpiar();
    const resultado = await contexto.app.get(CrearVendedorCasoUso).ejecutar({
      nombre: 'Vendedor de Prueba',
      correo: CORREO_VENDEDOR,
      telefono: '0987654321',
      clave: CLAVE_VENDEDOR,
    });
    if (!resultado.creado) {
      throw new Error('No se creó el Vendedor de prueba');
    }
    idVendedor = resultado.idUsuario;
    idMaria = await registrar('María Zambrano', CORREO_MARIA, '0991234567');
    idLuis = await registrar('Luis Mera', CORREO_LUIS, '0997654321');
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('D-52: mensajes de ingreso de la app', () => {
    it('correo sin cuenta: /ingreso/cliente → 401 CORREO_NO_REGISTRADO; /ingreso/vendedor → CREDENCIALES_INVALIDAS', async () => {
      const app = await ingresar('cliente', 'nadie@ejemplo.test', CLAVE).expect(
        401,
      );
      const panel = await ingresar(
        'vendedor',
        'nadie@ejemplo.test',
        CLAVE,
      ).expect(401);

      expect(app.body).toEqual(CORREO_NO_REGISTRADO);
      expect(panel.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await contar('sesiones')).toBe(0);
    });

    it('SESION_FALLIDA con motivo CORREO_NO_REGISTRADO conserva el correo intentado (D-20) y nunca la clave', async () => {
      await ingresar('cliente', ' Nadie@Ejemplo.TEST', 'ClaveIntentada99').expect(
        401,
      );

      const [fila] = await auditoria('SESION_FALLIDA');
      expect(fila).toMatchObject({
        id_usuario: null,
        entidad: 'SESION',
        id_entidad: null,
        detalle: {
          correo: 'nadie@ejemplo.test',
          canal: 'APP',
          motivo: 'CORREO_NO_REGISTRADO',
        },
      });
      expect(JSON.stringify(fila)).not.toContain('ClaveIntentada99');
    });

    it('clave incorrecta → CREDENCIALES_INVALIDAS; el Vendedor en la app → CREDENCIALES_INVALIDAS (no se revela el rol)', async () => {
      const claveMala = await ingresar('cliente', CORREO_MARIA, 'Otra2026x').expect(
        401,
      );
      const vendedorEnApp = await ingresar(
        'cliente',
        CORREO_VENDEDOR,
        CLAVE_VENDEDOR,
      ).expect(401);
      const vendedorClaveMala = await ingresar(
        'cliente',
        CORREO_VENDEDOR,
        'Otra2026x',
      ).expect(401);

      expect(claveMala.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(vendedorEnApp.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(vendedorClaveMala.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await contar('sesiones')).toBe(0);

      const motivos = (await auditoria('SESION_FALLIDA')).map(
        (fila) => fila.detalle.motivo,
      );
      expect(motivos).toEqual([
        'CREDENCIALES_INVALIDAS',
        'ROL_NO_PERMITIDO',
        'CREDENCIALES_INVALIDAS',
      ]);
    });

    it('cuenta desactivada: clave correcta → 403 CUENTA_DESACTIVADA; clave incorrecta → 401 genérico', async () => {
      const vendedor = await sesionVendedor();
      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);
      reiniciarLimite();

      const correcta = await ingresar('cliente', CORREO_MARIA, CLAVE).expect(
        403,
      );
      const incorrecta = await ingresar(
        'cliente',
        CORREO_MARIA,
        'Otra2026x',
      ).expect(401);

      expect(correcta.body).toEqual(CUENTA_DESACTIVADA);
      expect(incorrecta.body).toEqual(CREDENCIALES_INVALIDAS);
      expect(await sesionesVigentesDe(idMaria)).toBe(0);

      const [desactivada, generica] = await auditoria('SESION_FALLIDA');
      expect(desactivada).toMatchObject({
        id_usuario: idMaria,
        detalle: {
          correo: CORREO_MARIA,
          canal: 'APP',
          motivo: 'CUENTA_DESACTIVADA',
        },
      });
      expect(generica.detalle.motivo).toBe('CREDENCIALES_INVALIDAS');
    });

    it('una cuenta desactivada tampoco ingresa por /ingreso/vendedor (401 genérico: el panel no cambia)', async () => {
      const vendedor = await sesionVendedor();
      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);

      const respuesta = await ingresar('vendedor', CORREO_MARIA, CLAVE).expect(
        401,
      );

      expect(respuesta.body).toEqual(CREDENCIALES_INVALIDAS);
    });

    it('reactivar permite ingresar otra vez', async () => {
      const vendedor = await sesionVendedor();
      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);
      await ingresar('cliente', CORREO_MARIA, CLAVE).expect(403);

      const reactivada = await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: true,
      }).expect(200);
      const ingreso = await ingresar('cliente', CORREO_MARIA, CLAVE).expect(200);

      expect(reactivada.body).toMatchObject({ id: idMaria, activo: true });
      expect((ingreso.body as CuerpoSesion).usuario).toMatchObject({
        id: idMaria,
        activo: true,
      });
    });
  });

  describe('D-53: PATCH /api/v1/usuarios/{id}/estado', () => {
    it('desactivar → 200 con el Usuario inactivo, cierra sus sesiones (la renovación falla) y deja CLIENTE_DESACTIVADO sin datos personales', async () => {
      const maria = await sesion('cliente', CORREO_MARIA, CLAVE);
      reiniciarLimite();
      await sesion('cliente', CORREO_MARIA, CLAVE);
      const luis = await sesion('cliente', CORREO_LUIS, CLAVE);
      const vendedor = await sesionVendedor();
      expect(await sesionesVigentesDe(idMaria)).toBe(2);

      const respuesta = await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);

      expect(respuesta.body).toMatchObject({
        id: idMaria,
        correo: CORREO_MARIA,
        rol: 'CLIENTE',
        activo: false,
      });
      expect(JSON.stringify(respuesta.body)).not.toMatch(/hash|clave/i);
      expect(await activoEnBase(idMaria)).toBe(false);
      expect(await sesionesVigentesDe(idMaria)).toBe(0);
      // Otras cuentas no se tocan.
      expect(await sesionesVigentesDe(idLuis)).toBe(1);
      expect(await sesionesVigentesDe(idVendedor)).toBe(1);

      const renovacion = await renovar(maria.tokenRenovacion).expect(401);
      expect(renovacion.body.codigo).toBe('TOKEN_INVALIDO');
      await renovar(luis.tokenRenovacion).expect(200);

      const [registro] = await auditoria('CLIENTE_DESACTIVADO');
      expect(registro).toEqual({
        accion: 'CLIENTE_DESACTIVADO',
        id_usuario: idVendedor,
        entidad: 'USUARIO',
        id_entidad: idMaria,
        detalle: { idUsuario: idMaria },
      });
      const texto = JSON.stringify(registro);
      expect(texto).not.toContain(CORREO_MARIA);
      expect(texto).not.toContain('Zambrano');
      expect(await auditoria('CLIENTE_REACTIVADO')).toHaveLength(0);
    });

    it('reactivar → 200 y CLIENTE_REACTIVADO con solo { idUsuario }', async () => {
      const vendedor = await sesionVendedor();
      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);

      const respuesta = await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: true,
      }).expect(200);

      expect(respuesta.body).toMatchObject({ id: idMaria, activo: true });
      expect(await activoEnBase(idMaria)).toBe(true);
      const [registro] = await auditoria('CLIENTE_REACTIVADO');
      expect(registro).toEqual({
        accion: 'CLIENTE_REACTIVADO',
        id_usuario: idVendedor,
        entidad: 'USUARIO',
        id_entidad: idMaria,
        detalle: { idUsuario: idMaria },
      });
    });

    it('es idempotente: repetir el mismo estado responde 200 sin registrar de nuevo', async () => {
      const vendedor = await sesionVendedor();

      // Ya activa → reactivar no escribe ni registra.
      const yaActiva = await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: true,
      }).expect(200);
      expect(yaActiva.body).toMatchObject({ id: idMaria, activo: true });
      expect(await auditoria('CLIENTE_REACTIVADO')).toHaveLength(0);

      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);
      const otraVez = await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);

      expect(otraVez.body).toMatchObject({ id: idMaria, activo: false });
      expect(await auditoria('CLIENTE_DESACTIVADO')).toHaveLength(1);
    });

    it('dos solicitudes simultáneas para desactivar registran una sola vez', async () => {
      const vendedor = await sesionVendedor();

      const [a, b] = await Promise.all([
        cambiarEstado(vendedor.tokenAcceso, idMaria, { activo: false }),
        cambiarEstado(vendedor.tokenAcceso, idMaria, { activo: false }),
      ]);

      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await auditoria('CLIENTE_DESACTIVADO')).toHaveLength(1);
    });

    it('CA-02: el Cliente llama PATCH /usuarios/{id}/estado → 403 NO_AUTORIZADO, ACCESO_DENEGADO y nada cambia', async () => {
      const luis = await sesion('cliente', CORREO_LUIS, CLAVE);

      const respuesta = await cambiarEstado(luis.tokenAcceso, idMaria, {
        activo: false,
      }).expect(403);

      expect(respuesta.body.codigo).toBe('NO_AUTORIZADO');
      expect(await activoEnBase(idMaria)).toBe(true);
      expect(await auditoria('CLIENTE_DESACTIVADO')).toHaveLength(0);
      const denegados = await auditoria('ACCESO_DENEGADO');
      expect(denegados).toHaveLength(1);
      expect(denegados[0].id_usuario).toBe(idLuis);
    });

    it('un Cliente tampoco puede desactivarse a sí mismo', async () => {
      const luis = await sesion('cliente', CORREO_LUIS, CLAVE);

      await cambiarEstado(luis.tokenAcceso, idLuis, { activo: false }).expect(
        403,
      );

      expect(await activoEnBase(idLuis)).toBe(true);
    });

    it('sin sesión → 401 NO_AUTENTICADO', async () => {
      const respuesta = await http()
        .patch(`/api/v1/usuarios/${idMaria}/estado`)
        .send({ activo: false })
        .expect(401);

      expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
    });

    it('desactivar al Vendedor → 422 OPERACION_NO_PERMITIDA; id inexistente → 404 USUARIO_NO_ENCONTRADO', async () => {
      const vendedor = await sesionVendedor();

      const alVendedor = await cambiarEstado(vendedor.tokenAcceso, idVendedor, {
        activo: false,
      }).expect(422);
      const inexistente = await cambiarEstado(
        vendedor.tokenAcceso,
        ID_INEXISTENTE,
        { activo: false },
      ).expect(404);

      expect(alVendedor.body.codigo).toBe('OPERACION_NO_PERMITIDA');
      expect(inexistente.body.codigo).toBe('USUARIO_NO_ENCONTRADO');
      expect(await activoEnBase(idVendedor)).toBe(true);
      expect(await sesionesVigentesDe(idVendedor)).toBe(1);
      expect(await auditoria('CLIENTE_DESACTIVADO')).toHaveLength(0);
    });

    it.each([
      ['activo ausente', {}],
      ['activo como texto', { activo: 'false' }],
      ['activo como número', { activo: 0 }],
      ['activo nulo', { activo: null }],
      ['campos no declarados', { activo: false, nombre: 'Otro' }],
    ])('%s → 400 DATOS_INVALIDOS y no cambia nada', async (_caso, cuerpo) => {
      const vendedor = await sesionVendedor();

      const respuesta = await cambiarEstado(
        vendedor.tokenAcceso,
        idMaria,
        cuerpo,
      ).expect(400);

      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      expect(await activoEnBase(idMaria)).toBe(true);
    });

    it('un id que no es UUID → 400 DATOS_INVALIDOS', async () => {
      const vendedor = await sesionVendedor();

      const respuesta = await cambiarEstado(
        vendedor.tokenAcceso,
        'no-es-uuid',
        { activo: false },
      ).expect(400);

      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
    });

    it('no hay borrado: la cuenta se conserva al desactivar y no existe una ruta para eliminarla', async () => {
      const vendedor = await sesionVendedor();
      const antes = await contar('usuarios');

      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);
      await http()
        .delete(`/api/v1/usuarios/${idMaria}`)
        .set('Authorization', `Bearer ${vendedor.tokenAcceso}`)
        .expect(404);

      expect(await contar('usuarios')).toBe(antes);
      const [fila] = await contexto.fuente.query<
        { nombre: string; correo: string }[]
      >('SELECT nombre, correo FROM usuarios WHERE id = $1', [idMaria]);
      expect(fila).toEqual({ nombre: 'María Zambrano', correo: CORREO_MARIA });
    });
  });

  describe('D-53: activo en el modelo público y en GET /api/v1/usuarios', () => {
    it('GET /usuarios/yo y el ingreso incluyen activo: true', async () => {
      const maria = await sesion('cliente', CORREO_MARIA, CLAVE);

      const yo = await http()
        .get('/api/v1/usuarios/yo')
        .set('Authorization', `Bearer ${maria.tokenAcceso}`)
        .expect(200);

      expect(maria.usuario.activo).toBe(true);
      expect(yo.body.activo).toBe(true);
    });

    it('la lista incluye activo y el filtro ?activo=true|false devuelve solo ese estado', async () => {
      const vendedor = await sesionVendedor();
      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);
      const lista = (consulta: string) =>
        http()
          .get(`/api/v1/usuarios${consulta}`)
          .set('Authorization', `Bearer ${vendedor.tokenAcceso}`);

      const todos = await lista('').expect(200);
      const activos = await lista('?activo=true').expect(200);
      const inactivos = await lista('?activo=false').expect(200);

      expect(estado(todos.body)).toEqual({ [idMaria]: false, [idLuis]: true });
      expect(todos.body.total).toBe(2);
      expect(estado(activos.body)).toEqual({ [idLuis]: true });
      expect(activos.body.total).toBe(1);
      expect(estado(inactivos.body)).toEqual({ [idMaria]: false });
      expect(inactivos.body.total).toBe(1);
    });

    it('RF-USU-05: la lista incluye correoVerificadoEn (fecha ISO o null) y ?correoVerificado=true|false filtra; total respeta el filtro y se combina con ?activo', async () => {
      const vendedor = await sesionVendedor();
      await contexto.fuente.query(
        'UPDATE usuarios SET correo_verificado_en = $2 WHERE id = $1',
        [idLuis, '2026-11-10T15:30:00.000Z'],
      );
      const lista = (consulta: string) =>
        http()
          .get(`/api/v1/usuarios${consulta}`)
          .set('Authorization', `Bearer ${vendedor.tokenAcceso}`);

      const todos = await lista('').expect(200);
      const verificados = await lista('?correoVerificado=true').expect(200);
      const sinVerificar = await lista('?correoVerificado=false').expect(200);

      expect(verificacion(todos.body)).toEqual({
        [idLuis]: '2026-11-10T15:30:00.000Z',
        [idMaria]: null,
      });
      expect(verificacion(verificados.body)).toEqual({
        [idLuis]: '2026-11-10T15:30:00.000Z',
      });
      expect(verificados.body.total).toBe(1);
      expect(verificacion(sinVerificar.body)).toEqual({ [idMaria]: null });
      expect(sinVerificar.body.total).toBe(1);
      // `total` respeta el filtro aunque la página sea de un solo elemento.
      const conteo = await lista('?correoVerificado=false&tamanio=1').expect(200);
      expect(conteo.body).toMatchObject({ tamanio: 1, total: 1 });
      // No se expone nada del proceso de verificación.
      expect(JSON.stringify(todos.body)).not.toMatch(/codigo(Correo|Verificacion)/i);

      await cambiarEstado(vendedor.tokenAcceso, idMaria, {
        activo: false,
      }).expect(200);
      const combinado = await lista(
        '?correoVerificado=false&activo=false',
      ).expect(200);
      expect(verificacion(combinado.body)).toEqual({ [idMaria]: null });
      const vacio = await lista('?correoVerificado=true&activo=false').expect(200);
      expect(vacio.body).toMatchObject({ elementos: [], total: 0 });
    });

    it('?correoVerificado con un valor que no es true ni false → 400 DATOS_INVALIDOS', async () => {
      const vendedor = await sesionVendedor();

      for (const valor of ['1', 'si', 'TRUE', '']) {
        const respuesta = await http()
          .get(`/api/v1/usuarios?correoVerificado=${valor}`)
          .set('Authorization', `Bearer ${vendedor.tokenAcceso}`)
          .expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      }
    });

    it('CA-02: el Cliente llama GET /usuarios con ?correoVerificado → 403 NO_AUTORIZADO y queda ACCESO_DENEGADO', async () => {
      const luis = await sesion('cliente', CORREO_LUIS, CLAVE);
      const antes = (await auditoria('ACCESO_DENEGADO')).length;

      const respuesta = await http()
        .get('/api/v1/usuarios?correoVerificado=false')
        .set('Authorization', `Bearer ${luis.tokenAcceso}`)
        .expect(403);

      expect(respuesta.body.codigo).toBe('NO_AUTORIZADO');
      expect((await auditoria('ACCESO_DENEGADO')).length).toBe(antes + 1);
    });

    it('?activo con un valor que no es true ni false → 400 DATOS_INVALIDOS', async () => {
      const vendedor = await sesionVendedor();

      for (const valor of ['1', 'si', 'TRUE', '']) {
        const respuesta = await http()
          .get(`/api/v1/usuarios?activo=${valor}`)
          .set('Authorization', `Bearer ${vendedor.tokenAcceso}`)
          .expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      }
    });
  });
});
