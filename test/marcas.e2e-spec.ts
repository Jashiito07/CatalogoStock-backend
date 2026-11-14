import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la subfase 2.2 (RF-PRO-04, RF-PRO-06, RF-CAT-05, CA-02, RNF-03,
 * RNF-11, D-43, D-48; contrato de productos, «Endpoints: marcas» y «Pruebas
 * mínimas») contra `catalogostock_pruebas` (D-23). Datos ficticios.
 */

const RUTA = '/api/v1/marcas';
const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const CORREO_CLIENTE = 'maria.zambrano@ejemplo.test';

const NO_AUTORIZADO = {
  codigo: 'NO_AUTORIZADO',
  mensaje: 'No tiene permiso para realizar esta acción.',
  detalles: {},
};

interface CuerpoSesion {
  tokenAcceso: string;
  usuario: { id: string; rol: string };
}

interface CuerpoMarca {
  id: string;
  nombre: string;
  color: string;
  colorAcento: string | null;
  textoSobreColor: string;
  textoSobreAcento: string | null;
  activa: boolean;
  orden: number;
  creadaEn: string;
}

interface FilaAuditoria {
  accion: string;
  id_usuario: string | null;
  entidad: string | null;
  id_entidad: string | null;
  detalle: Record<string, unknown>;
}

function conToken<T extends { set(campo: string, valor: string): T }>(
  solicitud: T,
  token: string,
): T {
  return solicitud.set('Authorization', `Bearer ${token}`);
}

describe('Subfase 2.2 (e2e): marcas (RF-PRO-04)', () => {
  let contexto: AppPruebas;
  let vendedor: CuerpoSesion;
  let cliente: CuerpoSesion;

  const http = () => request(contexto.app.getHttpServer());

  const ingresar = (
    canal: 'cliente' | 'vendedor',
    correo: string,
    clave: string,
  ) =>
    http()
      .post(`/api/v1/autenticacion/ingreso/${canal}`)
      .send({ correo, clave });

  const comoVendedor = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, vendedor.tokenAcceso);
  const comoCliente = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, cliente.tokenAcceso);

  const crear = (cuerpo: Record<string, unknown>) =>
    comoVendedor(http().post(RUTA)).send(cuerpo);

  const crearOk = async (
    cuerpo: Record<string, unknown>,
  ): Promise<CuerpoMarca> =>
    (await crear(cuerpo).expect(201)).body as CuerpoMarca;

  const listar = (consulta = '') =>
    comoVendedor(http().get(`${RUTA}${consulta}`));

  async function auditoria(accion: string): Promise<FilaAuditoria[]> {
    return contexto.fuente.query<FilaAuditoria[]>(
      `SELECT accion, id_usuario, entidad, id_entidad, detalle FROM auditoria
       WHERE accion = $1 ORDER BY fecha, id`,
      [accion],
    );
  }

  async function crearTres(): Promise<{ inactiva: CuerpoMarca }> {
    await crearOk({ nombre: 'Esika', color: '#E1251B', orden: 2 });
    await crearOk({ nombre: 'Avon', color: '#FF2469', orden: 1 });
    const inactiva = await crearOk({
      nombre: 'Cyzone',
      color: '#A90061',
      orden: 1,
    });
    await comoVendedor(http().patch(`${RUTA}/${inactiva.id}`))
      .send({ activa: false })
      .expect(200);
    return { inactiva };
  }

  async function contarMarcas(): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      'SELECT count(*) AS total FROM marcas',
    );
    return Number(total);
  }

  async function contarAuditoria(): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      'SELECT count(*) AS total FROM auditoria',
    );
    return Number(total);
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
    await http()
      .post('/api/v1/usuarios/registro')
      .send({
        nombre: 'María Zambrano',
        correo: CORREO_CLIENTE,
        telefono: '0991234567',
        clave: CLAVE,
        aceptaPrivacidad: true,
        versionPrivacidad: VERSION_AVISO,
      })
      .expect(201);
    vendedor = (
      await ingresar('vendedor', CORREO_VENDEDOR, CLAVE_VENDEDOR).expect(200)
    ).body as CuerpoSesion;
    cliente = (await ingresar('cliente', CORREO_CLIENTE, CLAVE).expect(200))
      .body as CuerpoSesion;
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('POST /marcas', () => {
    it('RF-PRO-04: el Vendedor crea una marca → 201 con el formato del contrato', async () => {
      const respuesta = await crear({
        nombre: '  Yanbal ',
        color: '#fc5823',
        colorAcento: null,
      }).expect(201);

      expect(respuesta.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        nombre: 'Yanbal',
        color: '#FC5823',
        colorAcento: null,
        textoSobreColor: '#1E293B',
        textoSobreAcento: null,
        activa: true,
        orden: 0,
        creadaEn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      });
      const [fila] = await contexto.fuente.query<
        { color: string; nombre_busqueda: string }[]
      >('SELECT color, nombre_busqueda FROM marcas');
      expect(fila).toEqual({ color: '#FC5823', nombre_busqueda: 'yanbal' });
    });

    it('RF-PRO-04 / CA-03: registra MARCA_CREADA con el nombre, la entidad MARCA y el Vendedor', async () => {
      const marca = await crearOk({ nombre: 'Yanbal', color: '#FC5823' });
      expect(await auditoria('MARCA_CREADA')).toEqual([
        {
          accion: 'MARCA_CREADA',
          id_usuario: vendedor.usuario.id,
          entidad: 'MARCA',
          id_entidad: marca.id,
          detalle: { nombre: 'Yanbal' },
        },
      ]);
    });

    it.each(['yanbal', 'YANBAL', ' Yanbal  ', 'ÝANBAL'])(
      'RF-PRO-04: el nombre repetido «%s» (mayúsculas o tildes distintas) → 409 MARCA_DUPLICADA',
      async (repetido) => {
        await crearOk({ nombre: 'Yanbal', color: '#FC5823' });
        const respuesta = await crear({
          nombre: repetido,
          color: '#FF2469',
        }).expect(409);
        expect(respuesta.body).toEqual({
          codigo: 'MARCA_DUPLICADA',
          mensaje: 'Ya existe una marca con ese nombre.',
          detalles: {},
        });
        expect(await contarMarcas()).toBe(1);
        expect(await auditoria('MARCA_CREADA')).toHaveLength(1);
      },
    );

    it('«Ésika» y «Esika» son la misma marca', async () => {
      await crearOk({ nombre: 'Ésika', color: '#E1251B' });
      await crear({ nombre: 'Esika', color: '#E1251B' }).expect(409);
    });

    it('RF-PRO-04: dos solicitudes simultáneas con el mismo nombre → una crea y la otra recibe 409 (índice único)', async () => {
      const [a, b] = await Promise.all([
        crear({ nombre: 'Cyzone', color: '#A90061' }),
        crear({ nombre: 'CYZONE', color: '#A90061' }),
      ]);
      expect([a.status, b.status].toSorted()).toEqual([201, 409]);
      expect(await contarMarcas()).toBe(1);
      expect(await auditoria('MARCA_CREADA')).toHaveLength(1);
    });

    it('RNF-11: el servidor calcula el texto con contraste ≥ 4.5:1 para los colores del DERCA', async () => {
      const casos = [
        { nombre: 'Yanbal', color: '#FC5823', texto: '#1E293B' },
        { nombre: 'Avon', color: '#FF2469', texto: '#0F172A' },
        { nombre: "L'Bel", color: '#2E1A47', texto: '#FFFFFF' },
        { nombre: 'Cyzone', color: '#A90061', texto: '#FFFFFF' },
        { nombre: 'Esika', color: '#E1251B', texto: '#FFFFFF' },
      ];
      for (const caso of casos) {
        const marca = await crearOk({ nombre: caso.nombre, color: caso.color });
        expect(marca.textoSobreColor).toBe(caso.texto);
      }
      const leonisa = await crearOk({
        nombre: 'Leonisa',
        color: '#222221',
        colorAcento: '#F36E21',
      });
      expect(leonisa).toMatchObject({
        textoSobreColor: '#FFFFFF',
        colorAcento: '#F36E21',
        textoSobreAcento: '#1E293B',
      });
    });

    it('sin orden, cada marca va al final; con orden, usa el indicado', async () => {
      const a = await crearOk({ nombre: 'Avon', color: '#FF2469' });
      const b = await crearOk({ nombre: 'Esika', color: '#E1251B' });
      const c = await crearOk({ nombre: 'Cyzone', color: '#A90061', orden: 7 });
      const d = await crearOk({ nombre: 'Leonisa', color: '#222221' });
      expect([a.orden, b.orden, c.orden, d.orden]).toEqual([0, 1, 7, 8]);
    });

    it.each([
      ['nombre de 1 carácter', { nombre: 'A', color: '#FC5823' }, 'nombre'],
      [
        'nombre de 41 caracteres',
        { nombre: 'A'.repeat(41), color: '#FC5823' },
        'nombre',
      ],
      ['nombre ausente', { color: '#FC5823' }, 'nombre'],
      ['nombre que no es texto', { nombre: 12, color: '#FC5823' }, 'nombre'],
      ['color sin #', { nombre: 'Yanbal', color: 'FC5823' }, 'color'],
      ['color corto', { nombre: 'Yanbal', color: '#FC582' }, 'color'],
      ['color ausente', { nombre: 'Yanbal' }, 'color'],
      [
        'acento inválido',
        { nombre: 'Yanbal', color: '#FC5823', colorAcento: 'naranja' },
        'colorAcento',
      ],
      [
        'orden negativo',
        { nombre: 'Yanbal', color: '#FC5823', orden: -1 },
        'orden',
      ],
      [
        'orden decimal',
        { nombre: 'Yanbal', color: '#FC5823', orden: 1.5 },
        'orden',
      ],
      [
        'orden nulo',
        { nombre: 'Yanbal', color: '#FC5823', orden: null },
        'orden',
      ],
    ])(
      'RNF-03: %s → 400 DATOS_INVALIDOS y nada cambia',
      async (_caso, cuerpo, campo) => {
        const registrosAntes = await contarAuditoria();
        const respuesta = await crear(cuerpo).expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
        expect(respuesta.body.detalles.errores).toEqual(
          expect.arrayContaining([expect.objectContaining({ campo })]),
        );
        expect(await contarMarcas()).toBe(0);
        expect(await contarAuditoria()).toBe(registrosAntes);
      },
    );

    it.each(['textoSobreColor', 'id', 'activa', 'creadaEn', 'rol'])(
      'RNF-03: el campo no declarado «%s» → 400 DATOS_INVALIDOS',
      async (campo) => {
        const respuesta = await crear({
          nombre: 'Yanbal',
          color: '#FC5823',
          [campo]: 'x',
        }).expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
        expect(await contarMarcas()).toBe(0);
      },
    );

    it('sin sesión → 401', async () => {
      await http()
        .post(RUTA)
        .send({ nombre: 'Yanbal', color: '#FC5823' })
        .expect(401);
      expect(await contarMarcas()).toBe(0);
    });

    it('CA-02: un Cliente recibe 403 NO_AUTORIZADO, nada cambia y queda ACCESO_DENEGADO', async () => {
      const respuesta = await comoCliente(http().post(RUTA))
        .send({ nombre: 'Yanbal', color: '#FC5823' })
        .expect(403);
      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      expect(await contarMarcas()).toBe(0);
      expect(await auditoria('MARCA_CREADA')).toHaveLength(0);
      expect(await auditoria('ACCESO_DENEGADO')).toEqual([
        {
          accion: 'ACCESO_DENEGADO',
          id_usuario: cliente.usuario.id,
          entidad: null,
          id_entidad: null,
          detalle: { metodo: 'POST', ruta: RUTA, rolUsuario: 'CLIENTE' },
        },
      ]);
    });
  });

  describe('PATCH /marcas/{id}', () => {
    it('RF-PRO-04: cambia solo lo enviado y registra MARCA_ACTUALIZADA con los campos', async () => {
      const marca = await crearOk({ nombre: 'Yanbal', color: '#FC5823' });

      const respuesta = await comoVendedor(http().patch(`${RUTA}/${marca.id}`))
        .send({ color: '#2e1a47', activa: false })
        .expect(200);

      expect(respuesta.body).toMatchObject({
        id: marca.id,
        nombre: 'Yanbal',
        color: '#2E1A47',
        textoSobreColor: '#FFFFFF',
        activa: false,
        orden: 0,
      });
      expect(await auditoria('MARCA_ACTUALIZADA')).toEqual([
        {
          accion: 'MARCA_ACTUALIZADA',
          id_usuario: vendedor.usuario.id,
          entidad: 'MARCA',
          id_entidad: marca.id,
          detalle: { campos: ['color', 'activa'] },
        },
      ]);
    });

    it('colorAcento null quita el acento; un valor nuevo lo cambia y recalcula el texto', async () => {
      const marca = await crearOk({
        nombre: 'Leonisa',
        color: '#222221',
        colorAcento: '#F36E21',
      });
      const sin = await comoVendedor(http().patch(`${RUTA}/${marca.id}`))
        .send({ colorAcento: null })
        .expect(200);
      expect(sin.body).toMatchObject({
        colorAcento: null,
        textoSobreAcento: null,
      });
      const con = await comoVendedor(http().patch(`${RUTA}/${marca.id}`))
        .send({ colorAcento: '#ffffff' })
        .expect(200);
      expect(con.body).toMatchObject({
        colorAcento: '#FFFFFF',
        textoSobreAcento: '#1E293B',
      });
    });

    it('cambia el orden y la marca se reordena en la lista', async () => {
      const avon = await crearOk({ nombre: 'Avon', color: '#FF2469' });
      await crearOk({ nombre: 'Esika', color: '#E1251B' });
      await comoVendedor(http().patch(`${RUTA}/${avon.id}`))
        .send({ orden: 5 })
        .expect(200);
      const lista = (await listar().expect(200)).body as {
        elementos: CuerpoMarca[];
      };
      expect(lista.elementos.map((m) => m.nombre)).toEqual(['Esika', 'Avon']);
    });

    it('renombrar a un nombre ya usado (otras mayúsculas o tildes) → 409 y nada cambia', async () => {
      await crearOk({ nombre: 'Yanbal', color: '#FC5823' });
      const avon = await crearOk({ nombre: 'Avon', color: '#FF2469' });
      const antes = await contarAuditoria();
      const respuesta = await comoVendedor(http().patch(`${RUTA}/${avon.id}`))
        .send({ nombre: 'ÝANBAL' })
        .expect(409);
      expect(respuesta.body.codigo).toBe('MARCA_DUPLICADA');
      const [fila] = await contexto.fuente.query<{ nombre: string }[]>(
        'SELECT nombre FROM marcas WHERE id = $1',
        [avon.id],
      );
      expect(fila.nombre).toBe('Avon');
      expect(await contarAuditoria()).toBe(antes);
    });

    it('puede cambiar las mayúsculas o tildes de su propio nombre', async () => {
      const marca = await crearOk({ nombre: 'esika', color: '#E1251B' });
      const respuesta = await comoVendedor(http().patch(`${RUTA}/${marca.id}`))
        .send({ nombre: 'Ésika' })
        .expect(200);
      expect(respuesta.body.nombre).toBe('Ésika');
    });

    it('un cuerpo sin cambios → 200 y no registra nada', async () => {
      const marca = await crearOk({ nombre: 'Yanbal', color: '#FC5823' });
      await comoVendedor(http().patch(`${RUTA}/${marca.id}`))
        .send({})
        .expect(200);
      await comoVendedor(http().patch(`${RUTA}/${marca.id}`))
        .send({ nombre: 'Yanbal', activa: true })
        .expect(200);
      expect(await auditoria('MARCA_ACTUALIZADA')).toHaveLength(0);
    });

    it('un id que no existe → 404 NO_ENCONTRADO', async () => {
      const respuesta = await comoVendedor(
        http().patch(`${RUTA}/00000000-0000-4000-8000-000000000999`),
      )
        .send({ activa: false })
        .expect(404);
      expect(respuesta.body.codigo).toBe('NO_ENCONTRADO');
    });

    it('un id que no es UUID → 400 DATOS_INVALIDOS', async () => {
      const respuesta = await comoVendedor(http().patch(`${RUTA}/abc`))
        .send({ activa: false })
        .expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
    });

    it.each([
      ['nombre corto', { nombre: 'A' }],
      ['nombre nulo', { nombre: null }],
      ['color nulo', { color: null }],
      ['color inválido', { color: '#12' }],
      ['acento inválido', { colorAcento: 'rojo' }],
      ['activa que no es booleano', { activa: 'false' }],
      ['activa nulo', { activa: null }],
      ['orden negativo', { orden: -1 }],
      ['campo no declarado', { textoSobreColor: '#000000' }],
    ])(
      'RNF-03: %s → 400 DATOS_INVALIDOS y la marca no cambia',
      async (_caso, cuerpo) => {
        const marca = await crearOk({ nombre: 'Yanbal', color: '#FC5823' });
        const respuesta = await comoVendedor(
          http().patch(`${RUTA}/${marca.id}`),
        )
          .send(cuerpo)
          .expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
        const [fila] = await contexto.fuente.query<
          { nombre: string; color: string; activa: boolean }[]
        >('SELECT nombre, color, activa FROM marcas WHERE id = $1', [marca.id]);
        expect(fila).toEqual({
          nombre: 'Yanbal',
          color: '#FC5823',
          activa: true,
        });
        expect(await auditoria('MARCA_ACTUALIZADA')).toHaveLength(0);
      },
    );

    it('CA-02: un Cliente recibe 403 y la marca no cambia', async () => {
      const marca = await crearOk({ nombre: 'Yanbal', color: '#FC5823' });
      const respuesta = await comoCliente(http().patch(`${RUTA}/${marca.id}`))
        .send({ activa: false })
        .expect(403);
      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      const [fila] = await contexto.fuente.query<{ activa: boolean }[]>(
        'SELECT activa FROM marcas WHERE id = $1',
        [marca.id],
      );
      expect(fila.activa).toBe(true);
      expect(await auditoria('MARCA_ACTUALIZADA')).toHaveLength(0);
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(1);
    });

    it('no existe DELETE: la ruta responde 404 y la marca sigue', async () => {
      const marca = await crearOk({ nombre: 'Yanbal', color: '#FC5823' });
      await comoVendedor(http().delete(`${RUTA}/${marca.id}`)).expect(404);
      expect(await contarMarcas()).toBe(1);
    });
  });

  describe('GET /marcas', () => {
    it('RF-PRO-04: sin marcas devuelve una lista vacía (D-48)', async () => {
      const respuesta = await listar('?incluirInactivas=true').expect(200);
      expect(respuesta.body).toEqual({ elementos: [] });
    });

    it('ordena por orden y luego por nombre; por defecto solo las activas', async () => {
      await crearTres();
      const respuesta = await listar().expect(200);
      const nombres = (
        respuesta.body as { elementos: CuerpoMarca[] }
      ).elementos.map((m) => m.nombre);
      expect(nombres).toEqual(['Avon', 'Esika']);
    });

    it('el Vendedor con incluirInactivas=true ve también las inactivas', async () => {
      await crearTres();
      const respuesta = await listar('?incluirInactivas=true').expect(200);
      const elementos = (respuesta.body as { elementos: CuerpoMarca[] })
        .elementos;
      expect(elementos.map((m) => m.nombre)).toEqual([
        'Avon',
        'Cyzone',
        'Esika',
      ]);
      expect(elementos.find((m) => m.nombre === 'Cyzone')?.activa).toBe(false);
    });

    it('RF-PRO-04 / RF-CAT-05: el Cliente ve las activas y incluirInactivas se ignora', async () => {
      await crearTres();
      for (const consulta of ['', '?incluirInactivas=true']) {
        const respuesta = await comoCliente(
          http().get(`${RUTA}${consulta}`),
        ).expect(200);
        const elementos = (respuesta.body as { elementos: CuerpoMarca[] })
          .elementos;
        expect(elementos.map((m) => m.nombre)).toEqual(['Avon', 'Esika']);
        expect(elementos.every((m) => m.activa)).toBe(true);
      }
    });

    it('incluirInactivas con otro valor → 400 DATOS_INVALIDOS', async () => {
      const respuesta = await listar('?incluirInactivas=quizas').expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
    });

    it('sin sesión → 401', async () => {
      await http().get(RUTA).expect(401);
    });

    it('reactivar una marca la devuelve al Cliente', async () => {
      const { inactiva } = await crearTres();
      await comoVendedor(http().patch(`${RUTA}/${inactiva.id}`))
        .send({ activa: true })
        .expect(200);
      const respuesta = await comoCliente(http().get(RUTA)).expect(200);
      expect(
        (respuesta.body as { elementos: CuerpoMarca[] }).elementos.map(
          (m) => m.nombre,
        ),
      ).toEqual(['Avon', 'Cyzone', 'Esika']);
    });
  });

  describe('GET /marcas/sugeridas', () => {
    interface Sugerida {
      nombre: string;
      color: string;
      colorAcento: string | null;
      yaCreada: boolean;
    }

    const sugeridas = async (): Promise<Sugerida[]> =>
      (
        (await comoVendedor(http().get(`${RUTA}/sugeridas`)).expect(200))
          .body as {
          elementos: Sugerida[];
        }
      ).elementos;

    it('RF-PRO-06 / D-48: la lista fija con sus colores y sin ninguna creada', async () => {
      expect(await sugeridas()).toEqual([
        {
          nombre: 'Yanbal',
          color: '#FC5823',
          colorAcento: null,
          yaCreada: false,
        },
        {
          nombre: 'Avon',
          color: '#FF2469',
          colorAcento: null,
          yaCreada: false,
        },
        {
          nombre: "L'Bel",
          color: '#2E1A47',
          colorAcento: null,
          yaCreada: false,
        },
        {
          nombre: 'Cyzone',
          color: '#A90061',
          colorAcento: null,
          yaCreada: false,
        },
        {
          nombre: 'Esika',
          color: '#E1251B',
          colorAcento: null,
          yaCreada: false,
        },
        {
          nombre: 'Leonisa',
          color: '#222221',
          colorAcento: '#F36E21',
          yaCreada: false,
        },
      ]);
    });

    it('yaCreada se calcula sin distinguir mayúsculas ni tildes y cuenta las inactivas', async () => {
      await crearOk({ nombre: 'YANBAL', color: '#FC5823' });
      const esika = await crearOk({ nombre: 'Ésika', color: '#E1251B' });
      await comoVendedor(http().patch(`${RUTA}/${esika.id}`))
        .send({ activa: false })
        .expect(200);
      await crearOk({ nombre: 'Marca propia', color: '#2563EB' });

      const creadas = (await sugeridas())
        .filter((s) => s.yaCreada)
        .map((s) => s.nombre);
      expect(creadas).toEqual(['Yanbal', 'Esika']);
    });

    it('CA-02: un Cliente recibe 403 NO_AUTORIZADO', async () => {
      const respuesta = await comoCliente(
        http().get(`${RUTA}/sugeridas`),
      ).expect(403);
      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(1);
    });

    it('sin sesión → 401', async () => {
      await http().get(`${RUTA}/sugeridas`).expect(401);
    });
  });
});
