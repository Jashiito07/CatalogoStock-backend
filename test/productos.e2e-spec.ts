import request from 'supertest';
import { CrearVendedorCasoUso } from '../src/modulos/usuarios/index.js';
import { type AppPruebas, crearAppPruebas } from './preparacion/app-pruebas.js';

/**
 * e2e de la subfase 2.3 (RF-PRO-01 a RF-PRO-05, RF-INV-03, RF-CAT-03, CA-02,
 * CA-04 a CA-07, RNF-03, PA-07; contrato de productos, «Endpoints: productos»
 * y «Pruebas mínimas») contra `catalogostock_pruebas` (D-23). Datos ficticios.
 */

const RUTA = '/api/v1/productos';
const VERSION_AVISO = '2026-11-1';
const CLAVE = 'Catalogo2026';
const CLAVE_VENDEDOR = 'Vendedor2026';
const CORREO_VENDEDOR = 'vendedor.e2e@ejemplo.test';
const CORREO_CLIENTE = 'maria.zambrano@ejemplo.test';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000999';

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
}

interface CuerpoProducto {
  id: string;
  nombre: string;
  marca: {
    id: string;
    nombre: string;
    color: string;
    colorAcento: string | null;
    textoSobreColor: string;
    textoSobreAcento: string | null;
  };
  precio: string;
  descripcion: string;
  disponibilidad: string;
  imagenes: unknown[];
  creadoEn: string;
  actualizadoEn: string;
}

interface CuerpoLista {
  elementos: CuerpoProducto[];
  pagina: number;
  tamanio: number;
  total: number;
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

const nombres = (cuerpo: unknown): string[] =>
  (cuerpo as CuerpoLista).elementos.map((p) => p.nombre);
describe('Subfase 2.3 (e2e): productos (RF-PRO-01 a RF-PRO-05)', () => {
  let contexto: AppPruebas;
  let vendedor: CuerpoSesion;
  let cliente: CuerpoSesion;
  let avon: CuerpoMarca;
  let cyzone: CuerpoMarca;

  const http = () => request(contexto.app.getHttpServer());

  const comoVendedor = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, vendedor.tokenAcceso);
  const comoCliente = <T extends { set(c: string, v: string): T }>(s: T) =>
    conToken(s, cliente.tokenAcceso);

  const ingresar = (
    canal: 'cliente' | 'vendedor',
    correo: string,
    clave: string,
  ) =>
    http()
      .post(`/api/v1/autenticacion/ingreso/${canal}`)
      .send({ correo, clave });

  const crearMarca = async (nombre: string): Promise<CuerpoMarca> =>
    (
      await comoVendedor(http().post('/api/v1/marcas'))
        .send({ nombre, color: '#2563EB' })
        .expect(201)
    ).body as CuerpoMarca;

  const crear = (cuerpo: Record<string, unknown>) =>
    comoVendedor(http().post(RUTA)).send(cuerpo);

  const crearOk = async (
    cuerpo: Record<string, unknown>,
  ): Promise<CuerpoProducto> =>
    (await crear({ marcaId: avon.id, precio: '10.00', ...cuerpo }).expect(201))
      .body as CuerpoProducto;

  const listar = (consulta = '') =>
    comoVendedor(http().get(`${RUTA}${consulta}`));

  async function auditoria(accion: string): Promise<FilaAuditoria[]> {
    return contexto.fuente.query<FilaAuditoria[]>(
      `SELECT accion, id_usuario, entidad, id_entidad, detalle FROM auditoria
       WHERE accion = $1 ORDER BY fecha, id`,
      [accion],
    );
  }

  async function contar(tabla: 'productos' | 'auditoria'): Promise<number> {
    const [{ total }] = await contexto.fuente.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM ${tabla}`,
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
    avon = await crearMarca('Avon');
    cyzone = await crearMarca('Cyzone');
  });

  afterAll(async () => {
    await contexto?.cerrar();
  });

  describe('POST /productos', () => {
    it('CA-04: crea con marca, precio y descripción → 201 con el formato del contrato y aparece en el listado', async () => {
      const respuesta = await crear({
        nombre: '  Crema hidratante Ésika 50 g ',
        marcaId: avon.id,
        precio: '12.50',
        descripcion: 'Crema facial de uso diario.',
      }).expect(201);

      expect(respuesta.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        nombre: 'Crema hidratante Ésika 50 g',
        marca: {
          id: avon.id,
          nombre: 'Avon',
          color: '#2563EB',
          colorAcento: null,
          textoSobreColor: '#FFFFFF',
          textoSobreAcento: null,
        },
        precio: '12.50',
        descripcion: 'Crema facial de uso diario.',
        disponibilidad: 'DISPONIBLE',
        imagenes: [],
        creadoEn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        actualizadoEn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      });
      const lista = await listar().expect(200);
      expect(nombres(lista.body)).toEqual(['Crema hidratante Ésika 50 g']);
      const [fila] = await contexto.fuente.query<
        { precio: string; nombre_busqueda: string }[]
      >('SELECT precio, nombre_busqueda FROM productos');
      expect(fila).toEqual({
        precio: '12.50',
        nombre_busqueda: 'crema hidratante esika 50 g',
      });
    });

    it('RF-PRO-05: «12.5» se guarda como «12.50»; acepta el máximo 99999.99 y el mínimo 0.01', async () => {
      expect((await crearOk({ nombre: 'Uno', precio: '12.5' })).precio).toBe(
        '12.50',
      );
      expect(
        (await crearOk({ nombre: 'Dos', precio: '99999.99' })).precio,
      ).toBe('99999.99');
      expect((await crearOk({ nombre: 'Tres', precio: '0.01' })).precio).toBe(
        '0.01',
      );
    });

    it('CA-03: registra PRODUCTO_CREADO con la marca, la entidad PRODUCTO y el Vendedor', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      expect(await auditoria('PRODUCTO_CREADO')).toEqual([
        {
          accion: 'PRODUCTO_CREADO',
          id_usuario: vendedor.usuario.id,
          entidad: 'PRODUCTO',
          id_entidad: producto.id,
          detalle: { marcaId: avon.id },
        },
      ]);
    });

    it.each([
      ['0.00', 'cero'],
      ['0', 'cero'],
      ['-1', 'negativo'],
      ['12.505', 'más de 2 decimales'],
      ['100000.00', 'sobre el máximo'],
      ['abc', 'texto'],
      ['', 'vacío'],
      [12.5, 'un número en lugar de texto'],
      [null, 'nulo'],
    ])(
      'RNF-03 / RN-11: el precio %j (%s) → 400 DATOS_INVALIDOS y nada cambia',
      async (precio) => {
        const registros = await contar('auditoria');
        const respuesta = await crear({
          nombre: 'Crema',
          marcaId: avon.id,
          precio,
        }).expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
        expect(respuesta.body.detalles.errores).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ campo: 'precio' }),
          ]),
        );
        expect(await contar('productos')).toBe(0);
        expect(await contar('auditoria')).toBe(registros);
      },
    );

    it.each([
      ['nombre de 1 carácter', { nombre: 'A' }, 'nombre'],
      ['nombre de 121 caracteres', { nombre: 'A'.repeat(121) }, 'nombre'],
      ['nombre ausente', { nombre: undefined }, 'nombre'],
      ['marca que no es UUID', { marcaId: 'abc' }, 'marcaId'],
      ['marca ausente', { marcaId: undefined }, 'marcaId'],
      ['precio ausente', { precio: undefined }, 'precio'],
      [
        'descripción de 2001 caracteres',
        { descripcion: 'x'.repeat(2001) },
        'descripcion',
      ],
      ['descripción nula', { descripcion: null }, 'descripcion'],
      [
        'RF-PRO-05 / RN-09: disponibilidad inválida',
        { disponibilidad: 'LIQUIDACION' },
        'disponibilidad',
      ],
    ])('RNF-03: %s → 400 DATOS_INVALIDOS', async (_caso, parcial, campo) => {
      const respuesta = await crear({
        nombre: 'Crema',
        marcaId: avon.id,
        precio: '10.00',
        ...parcial,
      }).expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      expect(respuesta.body.detalles.errores).toEqual(
        expect.arrayContaining([expect.objectContaining({ campo })]),
      );
      expect(await contar('productos')).toBe(0);
    });

    it.each(['id', 'imagenes', 'creadoEn', 'marca', 'eliminadoEn'])(
      'RNF-03: el campo no declarado «%s» → 400 DATOS_INVALIDOS',
      async (campo) => {
        const respuesta = await crear({
          nombre: 'Crema',
          marcaId: avon.id,
          precio: '10.00',
          [campo]: 'x',
        }).expect(400);
        expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
        expect(await contar('productos')).toBe(0);
      },
    );

    it('la marca no existe → 404 NO_ENCONTRADO', async () => {
      const respuesta = await crear({
        nombre: 'Crema',
        marcaId: ID_INEXISTENTE,
        precio: '10.00',
      }).expect(404);
      expect(respuesta.body.codigo).toBe('NO_ENCONTRADO');
      expect(await contar('productos')).toBe(0);
    });

    it('RF-PRO-04: la marca está inactiva → 422 MARCA_INACTIVA y nada cambia', async () => {
      await comoVendedor(http().patch(`/api/v1/marcas/${cyzone.id}`))
        .send({ activa: false })
        .expect(200);
      const registros = await contar('auditoria');
      const respuesta = await crear({
        nombre: 'Crema',
        marcaId: cyzone.id,
        precio: '10.00',
      }).expect(422);
      expect(respuesta.body.codigo).toBe('MARCA_INACTIVA');
      expect(await contar('productos')).toBe(0);
      expect(await contar('auditoria')).toBe(registros);
    });

    it('sin sesión → 401', async () => {
      await http()
        .post(RUTA)
        .send({ nombre: 'Crema', marcaId: avon.id, precio: '10.00' })
        .expect(401);
    });

    it('CA-02: un Cliente recibe 403 NO_AUTORIZADO, nada cambia y queda ACCESO_DENEGADO', async () => {
      const respuesta = await comoCliente(http().post(RUTA))
        .send({ nombre: 'Crema', marcaId: avon.id, precio: '10.00' })
        .expect(403);
      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      expect(await contar('productos')).toBe(0);
      expect(await auditoria('PRODUCTO_CREADO')).toHaveLength(0);
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

  describe('PATCH /productos/{id}', () => {
    it('CA-05: cambia el precio → 200, el listado muestra el nuevo y la bitácora guarda anterior y nuevo', async () => {
      const producto = await crearOk({ nombre: 'Crema', precio: '12.50' });

      const respuesta = await comoVendedor(
        http().patch(`${RUTA}/${producto.id}`),
      )
        .send({ precio: '13' })
        .expect(200);
      expect(respuesta.body).toMatchObject({
        id: producto.id,
        precio: '13.00',
      });

      const lista = (await listar().expect(200)).body as CuerpoLista;
      expect(lista.elementos[0].precio).toBe('13.00');
      expect(await auditoria('PRODUCTO_ACTUALIZADO')).toEqual([
        {
          accion: 'PRODUCTO_ACTUALIZADO',
          id_usuario: vendedor.usuario.id,
          entidad: 'PRODUCTO',
          id_entidad: producto.id,
          detalle: {
            campos: ['precio'],
            precioAnterior: '12.50',
            precioNuevo: '13.00',
          },
        },
      ]);
    });

    it('CA-07 / RF-PRO-05: la disponibilidad cambia entre los 3 valores', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      for (const valor of ['AGOTADO', 'PENDIENTE_REPOSICION', 'DISPONIBLE']) {
        const respuesta = await comoVendedor(
          http().patch(`${RUTA}/${producto.id}`),
        )
          .send({ disponibilidad: valor })
          .expect(200);
        expect(respuesta.body.disponibilidad).toBe(valor);
      }
      const registros = await auditoria('PRODUCTO_ACTUALIZADO');
      expect(registros).toHaveLength(3);
      expect(registros[0].detalle).toEqual({ campos: ['disponibilidad'] });
    });

    it('RN-09: otra disponibilidad → 400 y el producto no cambia', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      const respuesta = await comoVendedor(
        http().patch(`${RUTA}/${producto.id}`),
      )
        .send({ disponibilidad: 'EN_OFERTA' })
        .expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      const [fila] = await contexto.fuente.query<{ disponibilidad: string }[]>(
        'SELECT disponibilidad FROM productos WHERE id = $1',
        [producto.id],
      );
      expect(fila.disponibilidad).toBe('DISPONIBLE');
    });

    it('cambia nombre, descripción y marca; el resto se conserva', async () => {
      const producto = await crearOk({
        nombre: 'Crema',
        descripcion: 'Original',
        precio: '5.00',
      });
      const respuesta = await comoVendedor(
        http().patch(`${RUTA}/${producto.id}`),
      )
        .send({ nombre: 'Crema nueva', descripcion: '', marcaId: cyzone.id })
        .expect(200);
      expect(respuesta.body).toMatchObject({
        nombre: 'Crema nueva',
        descripcion: '',
        precio: '5.00',
        marca: { id: cyzone.id, nombre: 'Cyzone' },
      });
      expect((await auditoria('PRODUCTO_ACTUALIZADO'))[0].detalle).toEqual({
        campos: ['nombre', 'marcaId', 'descripcion'],
      });
    });

    it('un cuerpo sin cambios → 200 y no registra nada', async () => {
      const producto = await crearOk({ nombre: 'Crema', precio: '12.50' });
      await comoVendedor(http().patch(`${RUTA}/${producto.id}`))
        .send({})
        .expect(200);
      await comoVendedor(http().patch(`${RUTA}/${producto.id}`))
        .send({ precio: '12.5', nombre: 'Crema' })
        .expect(200);
      expect(await auditoria('PRODUCTO_ACTUALIZADO')).toHaveLength(0);
    });

    it.each([
      ['precio con 3 decimales', { precio: '12.505' }],
      ['precio cero', { precio: '0.00' }],
      ['precio negativo', { precio: '-1' }],
      ['precio numérico', { precio: 12.5 }],
      ['nombre corto', { nombre: 'A' }],
      ['nombre nulo', { nombre: null }],
      ['marca que no es UUID', { marcaId: 'x' }],
      ['campo no declarado', { imagenes: [] }],
    ])('RNF-03: %s → 400 y el producto no cambia', async (_caso, cuerpo) => {
      const producto = await crearOk({ nombre: 'Crema', precio: '12.50' });
      const respuesta = await comoVendedor(
        http().patch(`${RUTA}/${producto.id}`),
      )
        .send(cuerpo)
        .expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
      const [fila] = await contexto.fuente.query<
        { nombre: string; precio: string }[]
      >('SELECT nombre, precio FROM productos WHERE id = $1', [producto.id]);
      expect(fila).toEqual({ nombre: 'Crema', precio: '12.50' });
      expect(await auditoria('PRODUCTO_ACTUALIZADO')).toHaveLength(0);
    });

    it('RF-PRO-04: pasar a una marca inactiva → 422 MARCA_INACTIVA; a una inexistente → 404', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      await comoVendedor(http().patch(`/api/v1/marcas/${cyzone.id}`))
        .send({ activa: false })
        .expect(200);
      const inactiva = await comoVendedor(
        http().patch(`${RUTA}/${producto.id}`),
      )
        .send({ marcaId: cyzone.id })
        .expect(422);
      expect(inactiva.body.codigo).toBe('MARCA_INACTIVA');
      await comoVendedor(http().patch(`${RUTA}/${producto.id}`))
        .send({ marcaId: ID_INEXISTENTE })
        .expect(404);
      const [fila] = await contexto.fuente.query<{ id_marca: string }[]>(
        'SELECT id_marca FROM productos WHERE id = $1',
        [producto.id],
      );
      expect(fila.id_marca).toBe(avon.id);
    });

    it('un producto cuya marca se desactivó puede cambiar de precio', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      await comoVendedor(http().patch(`/api/v1/marcas/${avon.id}`))
        .send({ activa: false })
        .expect(200);
      await comoVendedor(http().patch(`${RUTA}/${producto.id}`))
        .send({ precio: '20' })
        .expect(200);
    });

    it('id inexistente → 404; id que no es UUID → 400', async () => {
      await comoVendedor(http().patch(`${RUTA}/${ID_INEXISTENTE}`))
        .send({ precio: '1' })
        .expect(404);
      const respuesta = await comoVendedor(http().patch(`${RUTA}/abc`))
        .send({ precio: '1' })
        .expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
    });

    it('CA-02: un Cliente recibe 403 y el producto no cambia', async () => {
      const producto = await crearOk({ nombre: 'Crema', precio: '12.50' });
      const respuesta = await comoCliente(
        http().patch(`${RUTA}/${producto.id}`),
      )
        .send({ precio: '1' })
        .expect(403);
      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      const [fila] = await contexto.fuente.query<{ precio: string }[]>(
        'SELECT precio FROM productos WHERE id = $1',
        [producto.id],
      );
      expect(fila.precio).toBe('12.50');
      expect(await auditoria('PRODUCTO_ACTUALIZADO')).toHaveLength(0);
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(1);
    });
  });

  describe('DELETE /productos/{id}', () => {
    it('CA-06 / PA-07: 204; ya no está en el listado ni en GET /{id} (404); la fila sigue en la base', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      await comoVendedor(http().delete(`${RUTA}/${producto.id}`)).expect(204);

      expect(nombres((await listar().expect(200)).body)).toEqual([]);
      await comoVendedor(http().get(`${RUTA}/${producto.id}`)).expect(404);
      await comoCliente(http().get(`${RUTA}/${producto.id}`)).expect(404);

      const [fila] = await contexto.fuente.query<
        { nombre: string; eliminado_en: Date | null }[]
      >('SELECT nombre, eliminado_en FROM productos WHERE id = $1', [
        producto.id,
      ]);
      expect(fila.nombre).toBe('Crema');
      expect(fila.eliminado_en).toBeInstanceOf(Date);
      expect(await auditoria('PRODUCTO_ELIMINADO')).toEqual([
        {
          accion: 'PRODUCTO_ELIMINADO',
          id_usuario: vendedor.usuario.id,
          entidad: 'PRODUCTO',
          id_entidad: producto.id,
          detalle: {},
        },
      ]);
    });

    it('un segundo DELETE → 404 y no registra otra eliminación', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      await comoVendedor(http().delete(`${RUTA}/${producto.id}`)).expect(204);
      const respuesta = await comoVendedor(
        http().delete(`${RUTA}/${producto.id}`),
      ).expect(404);
      expect(respuesta.body.codigo).toBe('NO_ENCONTRADO');
      expect(await auditoria('PRODUCTO_ELIMINADO')).toHaveLength(1);
    });

    it('un producto eliminado no se puede modificar (404)', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      await comoVendedor(http().delete(`${RUTA}/${producto.id}`)).expect(204);
      await comoVendedor(http().patch(`${RUTA}/${producto.id}`))
        .send({ precio: '1' })
        .expect(404);
    });

    it('id inexistente → 404; no UUID → 400', async () => {
      await comoVendedor(http().delete(`${RUTA}/${ID_INEXISTENTE}`)).expect(
        404,
      );
      await comoVendedor(http().delete(`${RUTA}/abc`)).expect(400);
    });

    it('CA-02: un Cliente recibe 403 y el producto sigue', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      const respuesta = await comoCliente(
        http().delete(`${RUTA}/${producto.id}`),
      ).expect(403);
      expect(respuesta.body).toEqual(NO_AUTORIZADO);
      const [fila] = await contexto.fuente.query<
        { eliminado_en: Date | null }[]
      >('SELECT eliminado_en FROM productos WHERE id = $1', [producto.id]);
      expect(fila.eliminado_en).toBeNull();
      expect(await auditoria('PRODUCTO_ELIMINADO')).toHaveLength(0);
      expect(await auditoria('ACCESO_DENEGADO')).toHaveLength(1);
    });

    it('sin sesión → 401', async () => {
      await http().delete(`${RUTA}/${ID_INEXISTENTE}`).expect(401);
    });
  });

  describe('GET /productos/{id}', () => {
    it('devuelve el producto con la marca y sus colores', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      const respuesta = await comoCliente(
        http().get(`${RUTA}/${producto.id}`),
      ).expect(200);
      expect(respuesta.body).toMatchObject({
        id: producto.id,
        marca: { nombre: 'Avon', textoSobreColor: '#FFFFFF' },
        imagenes: [],
      });
    });

    it('RF-PRO-04: con la marca inactiva, el Cliente recibe 404 y el Vendedor 200', async () => {
      const producto = await crearOk({ nombre: 'Crema' });
      await comoVendedor(http().patch(`/api/v1/marcas/${avon.id}`))
        .send({ activa: false })
        .expect(200);
      await comoCliente(http().get(`${RUTA}/${producto.id}`)).expect(404);
      await comoVendedor(http().get(`${RUTA}/${producto.id}`)).expect(200);
    });

    it('404 si no existe; 400 si el id no es UUID; 401 sin sesión', async () => {
      await comoVendedor(http().get(`${RUTA}/${ID_INEXISTENTE}`)).expect(404);
      await comoVendedor(http().get(`${RUTA}/abc`)).expect(400);
      await http().get(`${RUTA}/${ID_INEXISTENTE}`).expect(401);
    });
  });

  describe('GET /productos', () => {
    it('sin productos → lista vacía con la paginación', async () => {
      const respuesta = await listar().expect(200);
      expect(respuesta.body).toEqual({
        elementos: [],
        pagina: 1,
        tamanio: 20,
        total: 0,
      });
    });

    it('RF-CAT-03: ordena por nombre sin distinguir mayúsculas ni tildes', async () => {
      await crearOk({ nombre: 'zapato' });
      await crearOk({ nombre: 'Ábaco' });
      await crearOk({ nombre: 'Crema' });
      expect(nombres((await listar().expect(200)).body)).toEqual([
        'Ábaco',
        'Crema',
        'zapato',
      ]);
    });

    it('RF-CAT-03: pagina (página, tamaño y total)', async () => {
      for (const n of ['Aa', 'Bb', 'Cc', 'Dd', 'Ee']) {
        await crearOk({ nombre: n });
      }
      const segunda = (await listar('?pagina=2&tamanio=2').expect(200))
        .body as CuerpoLista;
      expect(nombres(segunda)).toEqual(['Cc', 'Dd']);
      expect(segunda).toMatchObject({ pagina: 2, tamanio: 2, total: 5 });
      const ultima = (await listar('?pagina=3&tamanio=2').expect(200))
        .body as CuerpoLista;
      expect(nombres(ultima)).toEqual(['Ee']);
      const fuera = (await listar('?pagina=9&tamanio=2').expect(200))
        .body as CuerpoLista;
      expect(fuera.elementos).toEqual([]);
      expect(fuera.total).toBe(5);
    });

    it.each([
      '?pagina=0',
      '?tamanio=0',
      '?tamanio=101',
      '?pagina=1.5',
      '?marcaId=abc',
      '?busqueda=',
      `?busqueda=${'a'.repeat(101)}`,
      '?disponibilidad=OTRA',
    ])('parámetros inválidos %s → 400 DATOS_INVALIDOS', async (consulta) => {
      const respuesta = await listar(consulta).expect(400);
      expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
    });

    it('RF-CAT-03: busca sin mayúsculas ni tildes en nombre y descripción', async () => {
      await crearOk({
        nombre: 'Crema hidratante Ésika',
        descripcion: 'Para el rostro',
      });
      await crearOk({ nombre: 'Perfume', descripcion: 'Aroma CÍTRICO' });
      await crearOk({ nombre: 'Labial' });

      expect(
        nombres((await listar('?busqueda=ESIKA').expect(200)).body),
      ).toEqual(['Crema hidratante Ésika']);
      expect(
        nombres((await listar('?busqueda=%C3%A9sika').expect(200)).body),
      ).toEqual(['Crema hidratante Ésika']);
      expect(
        nombres((await listar('?busqueda=citrico').expect(200)).body),
      ).toEqual(['Perfume']);
      expect(
        nombres((await listar('?busqueda=rostro').expect(200)).body),
      ).toEqual(['Crema hidratante Ésika']);
      expect(
        (await listar('?busqueda=inexistente').expect(200)).body,
      ).toMatchObject({ elementos: [], total: 0 });
    });

    it('la búsqueda trata % y _ como texto, no como comodines', async () => {
      await crearOk({ nombre: 'Crema 100% natural' });
      await crearOk({ nombre: 'Crema fina' });
      expect(nombres((await listar('?busqueda=%25').expect(200)).body)).toEqual(
        ['Crema 100% natural'],
      );
      expect(nombres((await listar('?busqueda=_').expect(200)).body)).toEqual(
        [],
      );
    });

    it('RF-CAT-03: filtra por marca y por disponibilidad (RF-INV-03: incluye los agotados)', async () => {
      await crearOk({ nombre: 'De Avon' });
      await crearOk({ nombre: 'Agotado Avon', disponibilidad: 'AGOTADO' });
      await crearOk({ nombre: 'De Cyzone', marcaId: cyzone.id });
      expect(nombres((await listar().expect(200)).body)).toEqual([
        'Agotado Avon',
        'De Avon',
        'De Cyzone',
      ]);
      expect(
        nombres((await listar(`?marcaId=${cyzone.id}`).expect(200)).body),
      ).toEqual(['De Cyzone']);
      expect(
        nombres((await listar('?disponibilidad=AGOTADO').expect(200)).body),
      ).toEqual(['Agotado Avon']);
      expect(
        nombres(
          (
            await listar(
              `?marcaId=${avon.id}&disponibilidad=DISPONIBLE`,
            ).expect(200)
          ).body,
        ),
      ).toEqual(['De Avon']);
      expect(
        nombres(
          (
            await comoCliente(
              http().get(`${RUTA}?disponibilidad=AGOTADO`),
            ).expect(200)
          ).body,
        ),
      ).toEqual(['Agotado Avon']);
    });

    it('RF-PRO-04: con una marca inactiva el Cliente no ve sus productos; el Vendedor sí', async () => {
      await crearOk({ nombre: 'De Avon' });
      await crearOk({ nombre: 'De Cyzone', marcaId: cyzone.id });
      await comoVendedor(http().patch(`/api/v1/marcas/${cyzone.id}`))
        .send({ activa: false })
        .expect(200);

      const delCliente = (await comoCliente(http().get(RUTA)).expect(200))
        .body as CuerpoLista;
      expect(nombres(delCliente)).toEqual(['De Avon']);
      expect(delCliente.total).toBe(1);
      const filtrada = (
        await comoCliente(http().get(`${RUTA}?marcaId=${cyzone.id}`)).expect(
          200,
        )
      ).body as CuerpoLista;
      expect(filtrada).toMatchObject({ elementos: [], total: 0 });
      expect(nombres((await listar().expect(200)).body)).toEqual([
        'De Avon',
        'De Cyzone',
      ]);

      await comoVendedor(http().patch(`/api/v1/marcas/${cyzone.id}`))
        .send({ activa: true })
        .expect(200);
      expect(
        nombres((await comoCliente(http().get(RUTA)).expect(200)).body),
      ).toEqual(['De Avon', 'De Cyzone']);
    });

    it('un Cliente sin ninguna marca activa recibe la lista vacía', async () => {
      await crearOk({ nombre: 'De Avon' });
      for (const marca of [avon, cyzone]) {
        await comoVendedor(http().patch(`/api/v1/marcas/${marca.id}`))
          .send({ activa: false })
          .expect(200);
      }
      expect((await comoCliente(http().get(RUTA)).expect(200)).body).toEqual({
        elementos: [],
        pagina: 1,
        tamanio: 20,
        total: 0,
      });
    });

    it('sin sesión → 401', async () => {
      await http().get(RUTA).expect(401);
    });
  });
});
