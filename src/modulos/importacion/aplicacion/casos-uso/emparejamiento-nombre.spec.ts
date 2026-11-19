import { Dinero } from '../../../../compartido/dominio/dinero.js';
import { crearPaginacion } from '../../../../compartido/dominio/paginacion.js';
import type { AccionRevision } from '../../dominio/accion-revision.js';
import type { BloqueTexto, PaginaTexto } from '../../dominio/texto-pagina.js';
import { CalculadorTotalesImportacion } from '../calculador-totales.js';
import { AprobarBorradoresCasoUso } from './aprobar-borradores.caso-uso.js';
import { CrearImportacionCasoUso } from './crear-importacion.caso-uso.js';
import {
  AuditoriaFalsa,
  BorradorRepositorioEnMemoria,
  CalculadorHuellaFalso,
  CreadorProductosFalso,
  DirectorioMarcasEnMemoria,
  generadorIdSecuencial,
  ID_MARCA_ACTIVA,
  ID_OTRA_MARCA,
  ID_VENDEDOR,
  ImportacionRepositorioEnMemoria,
  LectorPdfFalso,
  ProductosExistentesFalso,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';
import { EditarBorradorCasoUso } from './editar-borrador.caso-uso.js';
import { ListarBorradoresCasoUso } from './listar-borradores.caso-uso.js';

/**
 * Emparejado por nombre de los borradores sin código y filtro `accion` (D-57;
 * contrato `productos-importacion`, «Actualizar precios al aprobar» y
 * `GET .../borradores`), con puertos falsos en memoria.
 */

function l(texto: string, x0: number, base: number, altura = 8): BloqueTexto {
  return { texto, x0, x1: x0 + texto.length * 4, y0: base - altura, y1: base, altura };
}

type Item = [nombre: string, codigo: string | null, precio: string];

/** Página estilo Yanbal: un producto cada 100 puntos; sin «CÓD.» si no tiene código. */
function pagina(items: readonly Item[]): PaginaTexto {
  const bloques: BloqueTexto[] = [];
  items.forEach(([nombre, codigo, precio], i) => {
    const y = 100 + i * 100;
    bloques.push(l(nombre, 50, y), l(`OFERTA US$ ${precio}`, 50, y + 12));
    if (codigo !== null) {
      bloques.push(l(`CÓD. ${codigo}`, 50, y + 24));
    }
    bloques.push(l(`Pág. ${i + 3}`, 50, y + 34));
  });
  return { numero: 12, ancho: 510, alto: 708, bloques };
}

const MES_1: Item[] = [
  ['Jabón Líquido Avena', null, '5.50'],
  ['Crema Hidratante Mani', '43873', '35.00'],
  ['Toalla Facial Suave', null, '3.00'],
];

describe('D-57: emparejado por nombre y filtro accion (casos de uso)', () => {
  let importaciones: ImportacionRepositorioEnMemoria;
  let borradores: BorradorRepositorioEnMemoria;
  let marcas: DirectorioMarcasEnMemoria;
  let lector: LectorPdfFalso;
  let existentes: ProductosExistentesFalso;
  let creador: CreadorProductosFalso;
  let crear: CrearImportacionCasoUso;
  let aprobar: AprobarBorradoresCasoUso;
  let listar: ListarBorradoresCasoUso;
  let editar: EditarBorradorCasoUso;
  let contador = 0;

  beforeEach(() => {
    importaciones = new ImportacionRepositorioEnMemoria();
    borradores = new BorradorRepositorioEnMemoria();
    marcas = new DirectorioMarcasEnMemoria();
    lector = new LectorPdfFalso([pagina(MES_1)]);
    existentes = new ProductosExistentesFalso();
    creador = new CreadorProductosFalso(existentes);
    const unidad = new UnidadDeTrabajoFalsa();
    const auditoria = new AuditoriaFalsa(unidad);
    const reloj = new RelojFalso();
    contador = 0;
    crear = new CrearImportacionCasoUso(
      importaciones,
      borradores,
      marcas,
      lector,
      new CalculadorHuellaFalso(),
      generadorIdSecuencial(),
      reloj,
      unidad,
      auditoria,
      new CalculadorTotalesImportacion(borradores, existentes),
    );
    aprobar = new AprobarBorradoresCasoUso(
      borradores,
      creador,
      existentes,
      marcas,
      reloj,
      unidad,
      auditoria,
    );
    listar = new ListarBorradoresCasoUso(importaciones, borradores, existentes);
    editar = new EditarBorradorCasoUso(borradores, marcas, existentes, reloj, unidad);
  });

  const importar = (items?: readonly Item[], marcaId: string = ID_MARCA_ACTIVA) => {
    if (items !== undefined) {
      lector.paginas = [pagina(items)];
    }
    contador++;
    return crear.ejecutar({
      idVendedor: ID_VENDEDOR,
      marcaId,
      nombreArchivo: 'catalogo.pdf',
      contenido: Buffer.from(`%PDF-1.4 mes ${contador}`),
    });
  };

  const borradorDe = (idImportacion: string, nombre: string) => {
    const encontrado = borradores.borradores.find(
      (b) => b.idImportacion === idImportacion && b.nombre === nombre,
    );
    if (encontrado === undefined) {
      throw new Error(`No hay borrador «${nombre}»`);
    }
    return encontrado;
  };

  const publicos = async (idImportacion: string, extra: Record<string, unknown> = {}) =>
    (
      await listar.ejecutar({
        idImportacion,
        paginacion: crearPaginacion(1, 100),
        ...extra,
      })
    ).elementos;

  const aprobarUno = async (id: string) =>
    (await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [id] }))[0];

  describe('borradores sin código', () => {
    it('un único producto sin código con el mismo nombre (sin distinguir mayúsculas, tildes ni signos): productoExistente, emparejadoPor NOMBRE y EMPAREJADO_POR_NOMBRE; aprobar actualiza solo el precio', async () => {
      const jabon = existentes.agregar({
        codigo: null,
        nombre: 'JABON, liquido (avena).',
        precio: Dinero.desdeTexto('4.00'),
      });
      const mes = await importar();

      const lista = await publicos(mes.importacion.id);
      const publico = lista.find((b) => b.nombre === 'Jabón Líquido Avena')!;
      expect(publico.productoExistente).toEqual({
        id: jabon.id,
        nombre: 'JABON, liquido (avena).',
        precio: Dinero.desdeTexto('4.00'),
        emparejadoPor: 'NOMBRE',
      });
      expect(publico.advertencias).toContain('EMPAREJADO_POR_NOMBRE');
      expect(publico.advertencias).not.toContain('YA_IMPORTADO');

      const resultado = await aprobarUno(publico.id);

      expect(resultado).toEqual({
        id: publico.id,
        estado: 'APROBADO',
        idProducto: jabon.id,
        accion: 'ACTUALIZADO',
        emparejadoPor: 'NOMBRE',
      });
      expect(creador.creados).toHaveLength(0);
      expect(existentes.actualizaciones).toEqual([
        { idVendedor: ID_VENDEDOR, idProducto: jabon.id, precio: '5.50' },
      ]);
      expect(jabon.nombre).toBe('JABON, liquido (avena).');
      expect(jabon.codigo).toBeNull();
    });

    it('con el mismo precio → SIN_CAMBIO por NOMBRE, sin escribir nada', async () => {
      existentes.agregar({ codigo: null, nombre: 'Jabón Líquido Avena', precio: Dinero.desdeTexto('5.50') });
      const mes = await importar();

      expect(await aprobarUno(borradorDe(mes.importacion.id, 'Jabón Líquido Avena').id)).toMatchObject({
        accion: 'SIN_CAMBIO',
        emparejadoPor: 'NOMBRE',
      });
      expect(existentes.actualizaciones).toHaveLength(0);
    });

    it('ambiguo: varios productos sin código con ese nombre → no se empareja, EMPAREJAMIENTO_AMBIGUO y se crea uno nuevo', async () => {
      existentes.agregar({ codigo: null, nombre: 'Jabón Líquido Avena' });
      existentes.agregar({ codigo: null, nombre: 'jabon liquido avena!' });
      const mes = await importar();

      const publico = (await publicos(mes.importacion.id)).find(
        (b) => b.nombre === 'Jabón Líquido Avena',
      )!;
      expect(publico.productoExistente).toBeNull();
      expect(publico.advertencias).toContain('EMPAREJAMIENTO_AMBIGUO');
      expect(publico.advertencias).not.toContain('EMPAREJADO_POR_NOMBRE');

      const resultado = await aprobarUno(publico.id);

      expect(resultado).toMatchObject({ accion: 'CREADO', emparejadoPor: null });
      expect(creador.creados).toHaveLength(1);
      expect(existentes.actualizaciones).toHaveLength(0);
    });

    it('nunca se empareja con un producto que tiene código, aunque el nombre sea igual', async () => {
      existentes.agregar({ codigo: '99999', nombre: 'Jabón Líquido Avena' });
      const mes = await importar();

      const publico = (await publicos(mes.importacion.id)).find(
        (b) => b.nombre === 'Jabón Líquido Avena',
      )!;
      expect(publico.productoExistente).toBeNull();
      expect(publico.advertencias).not.toContain('EMPAREJAMIENTO_AMBIGUO');
      expect(await aprobarUno(publico.id)).toMatchObject({ accion: 'CREADO' });
    });

    it('un borrador con código nunca se empareja por nombre: si el código es nuevo se crea, aunque exista un producto sin código con ese nombre', async () => {
      const sinCodigo = existentes.agregar({
        codigo: null,
        nombre: 'Crema Hidratante Mani',
        precio: Dinero.desdeTexto('20.00'),
      });
      const mes = await importar();
      const crema = borradorDe(mes.importacion.id, 'Crema Hidratante Mani');

      const publico = (await publicos(mes.importacion.id)).find((b) => b.id === crema.id)!;
      expect(publico.productoExistente).toBeNull();
      const resultado = await aprobarUno(crema.id);

      expect(resultado).toMatchObject({ accion: 'CREADO', emparejadoPor: null });
      expect(creador.creados[0]).toMatchObject({ codigo: '43873' });
      expect(sinCodigo.precio.aTexto()).toBe('20.00');
    });

    it('un borrador con NOMBRE_DUDOSO nunca se empareja por nombre', async () => {
      existentes.agregar({ codigo: null, nombre: 'Ab' });
      existentes.agregar({ codigo: null, nombre: 'Zy' });
      const mes = await importar([
        ['Ab', null, '1.00'],
        ['Zy', null, '2.00'],
      ]);

      for (const nombre of ['Ab', 'Zy']) {
        const borrador = borradorDe(mes.importacion.id, nombre);
        expect(borrador.advertencias).toContain('NOMBRE_DUDOSO');
        const publico = (await publicos(mes.importacion.id)).find((b) => b.id === borrador.id)!;
        expect(publico.productoExistente).toBeNull();
        expect(await aprobarUno(borrador.id)).toMatchObject({ accion: 'CREADO' });
      }
      expect(existentes.actualizaciones).toHaveLength(0);
    });

    it('no cuentan los productos eliminados ni los de otra marca', async () => {
      existentes.agregar({ codigo: null, nombre: 'Jabón Líquido Avena', eliminado: true });
      existentes.agregar({ codigo: null, nombre: 'Jabón Líquido Avena', marcaId: ID_OTRA_MARCA });
      const mes = await importar();

      const publico = (await publicos(mes.importacion.id)).find(
        (b) => b.nombre === 'Jabón Líquido Avena',
      )!;
      expect(publico.productoExistente).toBeNull();
      expect(publico.advertencias).not.toContain('EMPAREJAMIENTO_AMBIGUO');
      expect(await aprobarUno(publico.id)).toMatchObject({ accion: 'CREADO' });
    });

    it('editar el nombre del borrador recalcula el emparejamiento en la respuesta', async () => {
      const toalla = existentes.agregar({ codigo: null, nombre: 'Toalla Facial Suave' });
      const mes = await importar([['Toalla Facial Suavecita', null, '3.00']]);
      const id = borradorDe(mes.importacion.id, 'Toalla Facial Suavecita').id;

      const antes = await editar.ejecutar({ idBorrador: id, cambios: { precio: '3.25' } });
      expect(antes.productoExistente).toBeNull();
      const despues = await editar.ejecutar({
        idBorrador: id,
        cambios: { nombre: 'toalla facial, suave' },
      });

      expect(despues.productoExistente).toMatchObject({ id: toalla.id, emparejadoPor: 'NOMBRE' });
      expect(despues.advertencias).toContain('EMPAREJADO_POR_NOMBRE');
    });
  });

  describe('el mismo catálogo dos meses seguidos', () => {
    it('no crea repetidos: los productos sin código del mes 1 se emparejan por nombre en el mes 2 y solo cambia el precio', async () => {
      const mes1 = await importar();
      const primeros = await aprobar.ejecutar({
        idVendedor: ID_VENDEDOR,
        ids: borradores.borradores.map((b) => b.id),
      });
      expect(primeros.map((r) => ('accion' in r ? r.accion : r.error))).toEqual([
        'CREADO',
        'CREADO',
        'CREADO',
      ]);
      expect(existentes.productos).toHaveLength(3);

      const mes2 = await importar([
        ['Jabón Líquido Avena', null, '6.00'],
        ['Crema Hidratante Mani', '43873', '37.00'],
        ['Toalla Facial Suave', null, '3.00'],
      ]);
      expect(mes2.totales).toMatchObject({ pendientes: 3, actualizaran: 3, nuevos: 0 });
      const ids = borradores.borradores
        .filter((b) => b.idImportacion === mes2.importacion.id)
        .map((b) => b.id);
      const segundos = await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids });

      expect(segundos.map((r) => ('accion' in r ? r.accion : r.error))).toEqual([
        'ACTUALIZADO',
        'ACTUALIZADO',
        'SIN_CAMBIO',
      ]);
      expect(segundos.map((r) => ('emparejadoPor' in r ? r.emparejadoPor : null))).toEqual([
        'NOMBRE',
        'CODIGO',
        'NOMBRE',
      ]);
      expect(existentes.productos).toHaveLength(3);
      expect(creador.creados).toHaveLength(3);
      expect(mes1.importacion.id).not.toBe(mes2.importacion.id);
    });

    it('dos borradores sin código con el mismo nombre en un catálogo: el segundo se empareja con el producto que creó el primero', async () => {
      const mes = await importar([
        ['Toalla Facial Suave', null, '3.00'],
        ['toalla facial suave', null, '3.50'],
      ]);
      const [uno, dos] = borradores.borradores.filter((b) => b.idImportacion === mes.importacion.id);

      expect(await aprobarUno(uno.id)).toMatchObject({ accion: 'CREADO' });
      expect(await aprobarUno(dos.id)).toMatchObject({ accion: 'ACTUALIZADO', emparejadoPor: 'NOMBRE' });
      expect(existentes.productos).toHaveLength(1);
      expect(existentes.productos[0].precio.aTexto()).toBe('3.50');
    });
  });

  describe('totales actualizaran y nuevos', () => {
    it('cuentan el emparejado por código y por nombre; los ambiguos y los de nombre dudoso son nuevos', async () => {
      existentes.agregar({ codigo: '43873', nombre: 'Crema Hidratante Mani' });
      existentes.agregar({ codigo: null, nombre: 'Jabón Líquido Avena' });
      existentes.agregar({ codigo: null, nombre: 'Toalla Facial Suave' });
      existentes.agregar({ codigo: null, nombre: 'toalla facial suave' });

      const mes = await importar();

      expect(mes.totales).toMatchObject({ pendientes: 3, actualizaran: 2, nuevos: 1 });
    });
  });

  async function conCatalogoMensual() {
    const crema = existentes.agregar({ codigo: '43873', nombre: 'Crema Hidratante Mani', precio: Dinero.desdeTexto('30.00') });
    const jabon = existentes.agregar({ codigo: null, nombre: 'Jabón Líquido Avena', precio: Dinero.desdeTexto('5.50') });
    const mes = await importar();
    return { crema, jabon, mes };
  }

    describe('filtro accion', () => {

    it('ACTUALIZAR: los que tienen producto existente (por código o por nombre); NUEVO: los que crearán un producto', async () => {
      const { mes } = await conCatalogoMensual();

      const actualizar = await publicos(mes.importacion.id, { accion: 'ACTUALIZAR' as AccionRevision });
      const nuevos = await publicos(mes.importacion.id, { accion: 'NUEVO' as AccionRevision });

      expect(actualizar.map((b) => b.nombre).toSorted()).toEqual([
        'Crema Hidratante Mani',
        'Jabón Líquido Avena',
      ]);
      expect(nuevos.map((b) => b.nombre)).toEqual(['Toalla Facial Suave']);
    });

    it('CAMBIO_PRECIO excluye los que quedarían SIN_CAMBIO', async () => {
      const { mes } = await conCatalogoMensual();

      const cambio = await publicos(mes.importacion.id, { accion: 'CAMBIO_PRECIO' as AccionRevision });

      // La crema sube de 30.00 a 35.00; el jabón sigue en 5.50.
      expect(cambio.map((b) => b.nombre)).toEqual(['Crema Hidratante Mani']);
    });

    it('se combina con la paginación en el servidor: total y páginas son los del filtro', async () => {
      await conCatalogoMensual();
      const mes2 = await importar([
        ['Jabón Líquido Avena', null, '6.00'],
        ['Crema Hidratante Mani', '43873', '37.00'],
        ['Toalla Facial Suave', null, '3.00'],
        ['Labial Mate Rojo', null, '6.00'],
        ['Esmalte Color Rosa', null, '8.00'],
      ]);
      const base = { idImportacion: mes2.importacion.id, accion: 'NUEVO' as AccionRevision };

      const primera = await listar.ejecutar({ ...base, paginacion: crearPaginacion(1, 2) });
      const segunda = await listar.ejecutar({ ...base, paginacion: crearPaginacion(2, 2) });
      const fuera = await listar.ejecutar({ ...base, paginacion: crearPaginacion(3, 2) });

      expect(primera).toMatchObject({ total: 3, pagina: 1, tamanio: 2 });
      expect(primera.elementos.map((b) => b.nombre)).toEqual([
        'Toalla Facial Suave',
        'Labial Mate Rojo',
      ]);
      expect(segunda.elementos.map((b) => b.nombre)).toEqual(['Esmalte Color Rosa']);
      expect(fuera.elementos).toHaveLength(0);
    });

    it('se combina con busqueda (nombre o código), conAdvertencias y paginaPdf', async () => {
      const { mes } = await conCatalogoMensual();
      const id = mes.importacion.id;

      expect(
        (await publicos(id, { accion: 'ACTUALIZAR', clave: 'crema' })).map((b) => b.codigo),
      ).toEqual(['43873']);
      // La búsqueda también cubre el código del borrador.
      expect(
        (await publicos(id, { accion: 'ACTUALIZAR', clave: '43873' })).map((b) => b.nombre),
      ).toEqual(['Crema Hidratante Mani']);
      expect((await publicos(id, { clave: '43873' })).map((b) => b.nombre)).toEqual([
        'Crema Hidratante Mani',
      ]);
      expect(await publicos(id, { accion: 'NUEVO', clave: 'crema' })).toHaveLength(0);
      // Sin código → SIN_CODIGO pide revisión; con código no.
      expect(
        (await publicos(id, { accion: 'ACTUALIZAR', conAdvertencias: true })).map((b) => b.nombre),
      ).toEqual(['Jabón Líquido Avena']);
      expect(await publicos(id, { accion: 'ACTUALIZAR', paginaPdf: 99 })).toHaveLength(0);
    });

    it('solo los pendientes actualizan o crean algo: con estado APROBADO y accion no hay resultados', async () => {
      const { mes } = await conCatalogoMensual();
      await aprobarUno(borradorDe(mes.importacion.id, 'Toalla Facial Suave').id);

      expect(
        await publicos(mes.importacion.id, { estado: 'APROBADO', accion: 'NUEVO' as AccionRevision }),
      ).toHaveLength(0);
      expect(
        (await publicos(mes.importacion.id, { accion: 'NUEVO' as AccionRevision })).map((b) => b.nombre),
      ).toEqual([]);
    });
  });
});
