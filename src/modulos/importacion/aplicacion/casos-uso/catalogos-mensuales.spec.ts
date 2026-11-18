import { Dinero } from '../../../../compartido/dominio/dinero.js';
import {
  ConflictoError,
  ReglaNegocioError,
} from '../../../../compartido/dominio/errores.js';
import { crearPaginacion } from '../../../../compartido/dominio/paginacion.js';
import { Borrador } from '../../dominio/borrador.js';
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
import { EliminarImportacionCasoUso } from './eliminar-importacion.caso-uso.js';
import {
  EliminarImportacionesVencidasCasoUso,
  TAMANIO_LOTE_RETENCION,
} from './eliminar-importaciones-vencidas.caso-uso.js';
import { ListarAusentesCasoUso } from './listar-ausentes.caso-uso.js';
import { ListarBorradoresCasoUso } from './listar-borradores.caso-uso.js';
import { ListarImportacionesCasoUso } from './listar-importaciones.caso-uso.js';
import { ObtenerImportacionCasoUso } from './obtener-importacion.caso-uso.js';

/**
 * Pruebas de los catálogos mensuales (D-57; contrato `productos-importacion`,
 * «Pruebas mínimas (catálogos mensuales)»), con puertos falsos en memoria y un
 * reloj controlado.
 */

function l(texto: string, x0: number, base: number, altura = 8): BloqueTexto {
  return { texto, x0, x1: x0 + texto.length * 4, y0: base - altura, y1: base, altura };
}

/** Página de Yanbal con 2 productos con código: 43873 (Crema) y 5054 (Esmalte). */
function paginaYanbal(precioCrema: string, precioEsmalte: string): PaginaTexto {
  return {
    numero: 12,
    ancho: 510,
    alto: 708,
    bloques: [
      l('Crema Hidratante Mani', 50, 100),
      l(`OFERTA US$ ${precioCrema}`, 50, 112),
      l('CÓD. 43873', 50, 134),
      l('Esmalte Color Rosa', 50, 200),
      l(`OFERTA US$ ${precioEsmalte}`, 50, 212),
      l('CÓD. 5054', 50, 234),
    ],
  };
}

const PDF_MES_1 = Buffer.from('%PDF-1.4 catalogo mes 1');
const PDF_MES_2 = Buffer.from('%PDF-1.4 catalogo mes 2');
const PDF_OTRA_MARCA = Buffer.from('%PDF-1.4 catalogo otra marca');

describe('D-57: catálogos mensuales (casos de uso)', () => {
  let importaciones: ImportacionRepositorioEnMemoria;
  let borradores: BorradorRepositorioEnMemoria;
  let marcas: DirectorioMarcasEnMemoria;
  let lector: LectorPdfFalso;
  let existentes: ProductosExistentesFalso;
  let creador: CreadorProductosFalso;
  let unidad: UnidadDeTrabajoFalsa;
  let auditoria: AuditoriaFalsa;
  let reloj: RelojFalso;
  let totales: CalculadorTotalesImportacion;
  let crear: CrearImportacionCasoUso;
  let aprobar: AprobarBorradoresCasoUso;
  let listarBorradores: ListarBorradoresCasoUso;
  let obtener: ObtenerImportacionCasoUso;
  let listarImportaciones: ListarImportacionesCasoUso;
  let ausentes: ListarAusentesCasoUso;
  let eliminar: EliminarImportacionCasoUso;
  let retencion: EliminarImportacionesVencidasCasoUso;

  beforeEach(() => {
    importaciones = new ImportacionRepositorioEnMemoria();
    borradores = new BorradorRepositorioEnMemoria();
    marcas = new DirectorioMarcasEnMemoria();
    lector = new LectorPdfFalso([paginaYanbal('35.00', '8.00')]);
    existentes = new ProductosExistentesFalso();
    creador = new CreadorProductosFalso(existentes);
    unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    reloj = new RelojFalso(new Date('2026-05-20T10:00:00.000Z'));
    totales = new CalculadorTotalesImportacion(borradores, existentes);
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
      totales,
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
    listarBorradores = new ListarBorradoresCasoUso(importaciones, borradores, existentes);
    obtener = new ObtenerImportacionCasoUso(importaciones, totales, marcas);
    listarImportaciones = new ListarImportacionesCasoUso(importaciones, totales, marcas);
    ausentes = new ListarAusentesCasoUso(importaciones, borradores, existentes);
    eliminar = new EliminarImportacionCasoUso(
      importaciones,
      borradores,
      unidad,
      auditoria,
    );
    retencion = new EliminarImportacionesVencidasCasoUso(
      importaciones,
      borradores,
      reloj,
      unidad,
      auditoria,
    );
  });

  const importar = (
    contenido: Buffer = PDF_MES_1,
    marcaId: string = ID_MARCA_ACTIVA,
  ) =>
    crear.ejecutar({
      idVendedor: ID_VENDEDOR,
      marcaId,
      nombreArchivo: 'C:\\Descargas\\catalogo-secreto.pdf',
      contenido,
    });

  const borradorDe = (idImportacion: string, codigo: string) => {
    const encontrado = borradores.borradores.find(
      (b) => b.idImportacion === idImportacion && b.codigo === codigo,
    );
    if (encontrado === undefined) {
      throw new Error(`No hay borrador ${codigo}`);
    }
    return encontrado;
  };

  const estadoDe = (id: string) => importaciones.importaciones.find((i) => i.id === id)!;

  const aprobarUno = async (id: string) =>
    (await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [id] }))[0];

  const conVigenteYArchivada = async (archivadaEn: string) => {
    reloj.actual = new Date('2026-04-01T10:00:00.000Z');
    const vieja = await importar(PDF_MES_1);
    reloj.actual = new Date(archivadaEn);
    const nueva = await importar(PDF_MES_2);
    return { vieja, nueva };
  };

  describe('ciclo de vida: vigente y archivada', () => {
    it('D-57: subir el catálogo del mes archiva el anterior de esa marca (no el de otra marca)', async () => {
      const mes1 = await importar(PDF_MES_1);
      const otraMarca = await importar(PDF_OTRA_MARCA, ID_OTRA_MARCA);
      expect(mes1.importacion.estado).toBe('VIGENTE');
      expect(otraMarca.importacion.estado).toBe('VIGENTE');

      reloj.actual = new Date('2026-06-20T10:00:00.000Z');
      const mes2 = await importar(PDF_MES_2);

      expect(estadoDe(mes1.importacion.id).estado).toBe('ARCHIVADA');
      expect(estadoDe(mes1.importacion.id).archivadaEn?.toISOString()).toBe(
        '2026-06-20T10:00:00.000Z',
      );
      expect(estadoDe(mes2.importacion.id).estado).toBe('VIGENTE');
      expect(estadoDe(otraMarca.importacion.id).estado).toBe('VIGENTE');
      expect(mes2.importacion.eliminaEn).toBeNull();
    });

    it('se conservan los datos extraídos del catálogo archivado (borradores con su estado y precios)', async () => {
      const mes1 = await importar(PDF_MES_1);
      await aprobarUno(borradorDe(mes1.importacion.id, '43873').id);
      await importar(PDF_MES_2);

      const archivados = borradores.borradores.filter(
        (b) => b.idImportacion === mes1.importacion.id,
      );
      expect(archivados).toHaveLength(2);
      expect(archivados.map((b) => b.estado).toSorted()).toEqual(['APROBADO', 'PENDIENTE']);
      expect(archivados.find((b) => b.codigo === '5054')?.precio?.aTexto()).toBe('8.00');
    });

    it('una importación archivada informa archivadaEn y eliminaEn = archivadaEn + 6 meses calendario', async () => {
      const mes1 = await importar(PDF_MES_1);
      reloj.actual = new Date('2026-08-31T12:00:00.000Z');
      await importar(PDF_MES_2);

      const vista = await obtener.ejecutar(mes1.importacion.id);

      expect(vista.importacion.estado).toBe('ARCHIVADA');
      expect(vista.importacion.archivadaEn?.toISOString()).toBe('2026-08-31T12:00:00.000Z');
      expect(vista.importacion.eliminaEn?.toISOString()).toBe('2027-02-28T12:00:00.000Z');
    });

    it('GET lista: más reciente primero, filtros por estado y marca, paginada, con totales', async () => {
      const mes1 = await importar(PDF_MES_1);
      reloj.actual = new Date('2026-06-20T10:00:00.000Z');
      const otra = await importar(PDF_OTRA_MARCA, ID_OTRA_MARCA);
      reloj.actual = new Date('2026-07-20T10:00:00.000Z');
      const mes2 = await importar(PDF_MES_2);
      const pagina = crearPaginacion();

      const todas = await listarImportaciones.ejecutar({ paginacion: pagina });
      expect(todas.total).toBe(3);
      expect(todas.elementos.map((v) => v.importacion.id)).toEqual([
        mes2.importacion.id,
        otra.importacion.id,
        mes1.importacion.id,
      ]);
      expect(todas.elementos[0].totales.pendientes).toBe(2);

      const archivadas = await listarImportaciones.ejecutar({
        estado: 'ARCHIVADA',
        paginacion: pagina,
      });
      expect(archivadas.elementos.map((v) => v.importacion.id)).toEqual([mes1.importacion.id]);

      const deLeonisa = await listarImportaciones.ejecutar({
        marcaId: ID_OTRA_MARCA,
        paginacion: pagina,
      });
      expect(deLeonisa.elementos.map((v) => v.marca.nombre)).toEqual(['Leonisa']);

      const segunda = await listarImportaciones.ejecutar({
        paginacion: crearPaginacion(2, 2),
      });
      expect(segunda).toMatchObject({ pagina: 2, tamanio: 2, total: 3 });
      expect(segunda.elementos.map((v) => v.importacion.id)).toEqual([mes1.importacion.id]);
    });
  });

  describe('actualizar precios al aprobar', () => {
    it('D-57, PA-07: un borrador con código existente trae productoExistente y YA_IMPORTADO; aprobarlo actualiza solo el precio y no crea otro producto', async () => {
      const crema = existentes.agregar({
        codigo: '43873',
        nombre: 'Crema del Vendedor',
        precio: Dinero.desdeTexto('30.00'),
      });
      const mes = await importar();
      const borrador = borradorDe(mes.importacion.id, '43873');

      const lista = await listarBorradores.ejecutar({
        idImportacion: mes.importacion.id,
        paginacion: crearPaginacion(),
      });
      const publico = lista.elementos.find((b) => b.codigo === '43873')!;
      expect(publico.productoExistente).toEqual({
        id: crema.id,
        nombre: 'Crema del Vendedor',
        precio: Dinero.desdeTexto('30.00'),
        emparejadoPor: 'CODIGO',
      });
      expect(publico.advertencias).toContain('YA_IMPORTADO');
      // El que no existe no trae producto ni la advertencia.
      const esmalte = lista.elementos.find((b) => b.codigo === '5054')!;
      expect(esmalte.productoExistente).toBeNull();
      expect(esmalte.advertencias).not.toContain('YA_IMPORTADO');

      const resultado = await aprobarUno(borrador.id);

      expect(resultado).toEqual({
        id: borrador.id,
        estado: 'APROBADO',
        idProducto: crema.id,
        accion: 'ACTUALIZADO',
        emparejadoPor: 'CODIGO',
      });
      expect(creador.creados).toHaveLength(0);
      expect(existentes.actualizaciones).toEqual([
        { idVendedor: ID_VENDEDOR, idProducto: crema.id, precio: '35.00' },
      ]);
      expect(crema.precio.aTexto()).toBe('35.00');
      expect(crema.nombre).toBe('Crema del Vendedor');
      expect(borradorDe(mes.importacion.id, '43873')).toMatchObject({
        estado: 'APROBADO',
        idProducto: crema.id,
      });
    });

    it('D-57: con el mismo precio → SIN_CAMBIO, sin escribir nada; sin código o con código nuevo → CREADO', async () => {
      const crema = existentes.agregar({ codigo: '43873', precio: Dinero.desdeTexto('35.00') });
      const mes = await importar();

      expect(await aprobarUno(borradorDe(mes.importacion.id, '43873').id)).toMatchObject({
        accion: 'SIN_CAMBIO',
        idProducto: crema.id,
      });
      expect(existentes.actualizaciones).toHaveLength(0);

      expect(await aprobarUno(borradorDe(mes.importacion.id, '5054').id)).toMatchObject({
        accion: 'CREADO',
      });
      expect(creador.creados).toEqual([
        expect.objectContaining({ codigo: '5054', marcaId: ID_MARCA_ACTIVA, precio: '8.00' }),
      ]);
    });

    it('D-57: un producto eliminado con ese código no cuenta: se crea uno nuevo', async () => {
      existentes.agregar({ codigo: '43873', eliminado: true });
      const mes = await importar();
      const borrador = borradorDe(mes.importacion.id, '43873');

      const lista = await listarBorradores.ejecutar({
        idImportacion: mes.importacion.id,
        paginacion: crearPaginacion(),
      });
      expect(lista.elementos.find((b) => b.codigo === '43873')?.productoExistente).toBeNull();
      expect(await aprobarUno(borrador.id)).toMatchObject({ accion: 'CREADO' });
      expect(creador.creados).toHaveLength(1);
      expect(existentes.actualizaciones).toHaveLength(0);
    });

    it('D-57: el código es por marca: el mismo código en otra marca no es el producto existente', async () => {
      existentes.agregar({ codigo: '43873', marcaId: ID_OTRA_MARCA });
      const mes = await importar();

      expect(await aprobarUno(borradorDe(mes.importacion.id, '43873').id)).toMatchObject({
        accion: 'CREADO',
      });
    });

    it('un borrador SIN_PRECIO no se aprueba, tampoco si el producto existe', async () => {
      lector.paginas = [paginaYanbal('35.00', '8.00')];
      existentes.agregar({ codigo: '5054' });
      const mes = await importar();
      const sinPrecio = borradorDe(mes.importacion.id, '5054');
      await borradores.guardar(
        // Un borrador sin precio como el que deja el lector.
        Borrador.reconstituir({
          ...sinPrecio.aPublico(),
          pagina: sinPrecio.pagina,
          posicion: sinPrecio.posicion,
          precio: null,
          advertencias: ['SIN_PRECIO'],
          creadoEn: sinPrecio.creadoEn,
          actualizadoEn: sinPrecio.actualizadoEn,
        }),
      );

      expect(await aprobarUno(sinPrecio.id)).toEqual({ id: sinPrecio.id, error: 'SIN_PRECIO' });
      expect(existentes.actualizaciones).toHaveLength(0);
    });

    it('si la marca del borrador se desactivó, no se actualiza ni se crea (MARCA_INACTIVA)', async () => {
      const crema = existentes.agregar({ codigo: '43873', precio: Dinero.desdeTexto('30.00') });
      const mes = await importar();
      marcas.marcas.find((m) => m.id === ID_MARCA_ACTIVA)!.activa = false;

      expect(await aprobarUno(borradorDe(mes.importacion.id, '43873').id)).toMatchObject({
        error: 'MARCA_INACTIVA',
      });
      expect(crema.precio.aTexto()).toBe('30.00');
      expect(creador.creados).toHaveLength(0);
    });

    it('aprobar dos veces: la segunda responde NO_PENDIENTE y no vuelve a actualizar', async () => {
      existentes.agregar({ codigo: '43873', precio: Dinero.desdeTexto('30.00') });
      const mes = await importar();
      const id = borradorDe(mes.importacion.id, '43873').id;

      await aprobarUno(id);
      expect(await aprobarUno(id)).toEqual({ id, error: 'NO_PENDIENTE' });
      expect(existentes.actualizaciones).toHaveLength(1);
    });

    it('carrera por el mismo código: si otra aprobación lo crea primero (CODIGO_DUPLICADO), se reintenta y se actualiza su precio', async () => {
      const mes = await importar();
      const id = borradorDe(mes.importacion.id, '43873').id;
      const original = creador.crear.bind(creador);
      let primera = true;
      creador.crear = async (datos) => {
        if (primera) {
          primera = false;
          // La aprobación rival crea el producto con otro precio y gana.
          existentes.agregar({ codigo: datos.codigo!, marcaId: datos.marcaId, precio: Dinero.desdeTexto('30.00') });
          throw new (class extends ConflictoError {})('CODIGO_DUPLICADO', 'duplicado');
        }
        return original(datos);
      };

      const resultado = await aprobarUno(id);

      expect(resultado).toMatchObject({ estado: 'APROBADO', accion: 'ACTUALIZADO' });
      expect(creador.creados).toHaveLength(0);
      expect(existentes.productos).toHaveLength(1);
      expect(existentes.productos[0].precio.aTexto()).toBe('35.00');
    });

    it('un error de dominio distinto no se oculta y el reintento solo ocurre con CODIGO_DUPLICADO', async () => {
      const mes = await importar();
      const id = borradorDe(mes.importacion.id, '43873').id;
      creador.crear = () =>
        Promise.reject(new (class extends ReglaNegocioError {})('OTRA_REGLA', 'otra'));

      await expect(aprobarUno(id)).rejects.toMatchObject({ codigo: 'OTRA_REGLA' });
    });
  });

  describe('totales: actualizaran, nuevos y ausentes', () => {
    it('actualizaran + nuevos = pendientes; ausentes = productos de la marca con código que no vienen en el catálogo', async () => {
      existentes.agregar({ codigo: '43873' });
      existentes.agregar({ codigo: '99999', nombre: 'Perfume que ya no viene' });
      existentes.agregar({ codigo: '77777', marcaId: ID_OTRA_MARCA });
      existentes.agregar({ codigo: '11111', eliminado: true });

      const vista = await importar();

      expect(vista.totales).toEqual({
        pendientes: 2,
        aprobados: 0,
        descartados: 0,
        conAdvertencias: 0,
        actualizaran: 1,
        nuevos: 1,
        ausentes: 1,
      });
    });

    it('después de aprobar, los totales por estado cambian y el producto sigue contando como existente', async () => {
      const mes = await importar();
      await aprobarUno(borradorDe(mes.importacion.id, '43873').id);

      const vista = await obtener.ejecutar(mes.importacion.id);

      expect(vista.totales).toMatchObject({
        pendientes: 1,
        aprobados: 1,
        actualizaran: 0,
        nuevos: 1,
        ausentes: 0,
      });
    });

    it('en una importación archivada, ausentes vale 0', async () => {
      existentes.agregar({ codigo: '99999' });
      const mes1 = await importar(PDF_MES_1);
      expect(mes1.totales.ausentes).toBe(1);
      await importar(PDF_MES_2);

      const archivada = await obtener.ejecutar(mes1.importacion.id);

      expect(archivada.totales.ausentes).toBe(0);
    });
  });

  describe('productos ausentes', () => {
    it('lista los productos de la marca con código que no vienen en la importación vigente y no cambia nada', async () => {
      existentes.agregar({ codigo: '43873' });
      const perfume = existentes.agregar({ codigo: '99999', nombre: 'Perfume', precio: Dinero.desdeTexto('20.00') });
      existentes.agregar({ codigo: '88888', nombre: 'Labial', disponibilidad: 'AGOTADO' });
      existentes.agregar({ codigo: '77777', marcaId: ID_OTRA_MARCA, nombre: 'De otra marca' });
      existentes.agregar({ codigo: '66666', eliminado: true, nombre: 'Eliminado' });
      const mes = await importar();
      const antes = structuredClone(
        existentes.productos.map((p) => ({ ...p, precio: p.precio.aTexto() })),
      );

      const pagina = await ausentes.ejecutar(mes.importacion.id, crearPaginacion());

      expect(pagina.total).toBe(2);
      expect(pagina.elementos).toEqual([
        {
          id: expect.any(String),
          nombre: 'Labial',
          codigo: '88888',
          precio: Dinero.desdeTexto('30.00'),
          disponibilidad: 'AGOTADO',
        },
        {
          id: perfume.id,
          nombre: 'Perfume',
          codigo: '99999',
          precio: Dinero.desdeTexto('20.00'),
          disponibilidad: 'DISPONIBLE',
        },
      ]);
      expect(
        existentes.productos.map((p) => ({ ...p, precio: p.precio.aTexto() })),
      ).toEqual(antes);
      expect(existentes.actualizaciones).toHaveLength(0);
      expect(auditoria.acciones()).toEqual(['IMPORTACION_CREADA']);
    });

    it('un código que viene en un borrador descartado o aprobado tampoco es ausente; pagina', async () => {
      existentes.agregar({ codigo: '43873' });
      existentes.agregar({ codigo: '99999', nombre: 'A' });
      existentes.agregar({ codigo: '88888', nombre: 'B' });
      existentes.agregar({ codigo: '77777', nombre: 'C' });
      const mes = await importar();
      await aprobarUno(borradorDe(mes.importacion.id, '43873').id);

      const primera = await ausentes.ejecutar(mes.importacion.id, crearPaginacion(1, 2));
      const segunda = await ausentes.ejecutar(mes.importacion.id, crearPaginacion(2, 2));

      expect(primera).toMatchObject({ total: 3, pagina: 1, tamanio: 2 });
      expect(primera.elementos.map((p) => p.nombre)).toEqual(['A', 'B']);
      expect(segunda.elementos.map((p) => p.nombre)).toEqual(['C']);
    });

    it('en una importación archivada → IMPORTACION_ARCHIVADA (422); inexistente → 404', async () => {
      const mes1 = await importar(PDF_MES_1);
      await importar(PDF_MES_2);

      await expect(ausentes.ejecutar(mes1.importacion.id, crearPaginacion())).rejects.toMatchObject({
        codigo: 'IMPORTACION_ARCHIVADA',
        categoria: 'REGLA_NEGOCIO',
      });
      await expect(
        ausentes.ejecutar('00000000-0000-4000-8000-000000000999', crearPaginacion()),
      ).rejects.toMatchObject({ categoria: 'NO_ENCONTRADO' });
    });
  });

  describe('eliminación manual', () => {
    it('D-57: elimina la importación y sus borradores, deja los productos, libera la huella y registra IMPORTACION_ELIMINADA (MANUAL)', async () => {
      const mes = await importar(PDF_MES_1);
      const aprobado = await aprobarUno(borradorDe(mes.importacion.id, '43873').id);
      const productosAntes = existentes.productos.length;
      expect(aprobado).toMatchObject({ accion: 'CREADO' });

      await eliminar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idImportacion: mes.importacion.id,
      });

      expect(importaciones.importaciones).toHaveLength(0);
      expect(borradores.borradores).toHaveLength(0);
      expect(existentes.productos).toHaveLength(productosAntes);
      const { actividad, enTransaccion } = auditoria.registradas.at(-1)!;
      expect(enTransaccion).toBe(true);
      expect(actividad).toEqual({
        accion: 'IMPORTACION_ELIMINADA',
        idUsuario: ID_VENDEDOR,
        entidad: 'IMPORTACION',
        idEntidad: mes.importacion.id,
        detalle: { idImportacion: mes.importacion.id, motivo: 'MANUAL', borradores: 2 },
      });
      expect(JSON.stringify(actividad)).not.toContain('catalogo-secreto');
      // La huella quedó libre: el mismo PDF se puede subir otra vez.
      await expect(importar(PDF_MES_1)).resolves.toMatchObject({
        importacion: { estado: 'VIGENTE' },
      });
    });

    it('se puede eliminar en cualquier estado (vigente o archivada); una importación que no existe → 404 y nada cambia', async () => {
      const mes1 = await importar(PDF_MES_1);
      const mes2 = await importar(PDF_MES_2);

      await eliminar.ejecutar({ idVendedor: ID_VENDEDOR, idImportacion: mes1.importacion.id });
      await eliminar.ejecutar({ idVendedor: ID_VENDEDOR, idImportacion: mes2.importacion.id });
      const registradas = auditoria.registradas.length;

      await expect(
        eliminar.ejecutar({ idVendedor: ID_VENDEDOR, idImportacion: mes1.importacion.id }),
      ).rejects.toMatchObject({ categoria: 'NO_ENCONTRADO' });
      expect(auditoria.registradas).toHaveLength(registradas);
    });

    it('aprobar o descartar un borrador de una importación eliminada responde NO_ENCONTRADO', async () => {
      const mes = await importar();
      const id = borradorDe(mes.importacion.id, '43873').id;
      await eliminar.ejecutar({ idVendedor: ID_VENDEDOR, idImportacion: mes.importacion.id });

      expect(await aprobarUno(id)).toEqual({ id, error: 'NO_ENCONTRADO' });
    });
  });

  describe('retención automática de 6 meses', () => {

    it('D-57: elimina solo las archivadas con 6 meses calendario cumplidos desde archivadaEn; 5 meses 29 días no (reloj controlado)', async () => {
      const { vieja } = await conVigenteYArchivada('2026-05-20T10:00:00.000Z');

      reloj.actual = new Date('2026-11-19T10:00:00.000Z');
      expect(await retencion.ejecutar()).toEqual({ eliminadas: 0, fallidas: 0 });
      expect(importaciones.importaciones).toHaveLength(2);

      reloj.actual = new Date('2026-11-20T09:59:59.999Z');
      expect((await retencion.ejecutar()).eliminadas).toBe(0);

      reloj.actual = new Date('2026-11-20T10:00:00.000Z');
      expect(await retencion.ejecutar()).toEqual({ eliminadas: 1, fallidas: 0 });
      expect(importaciones.importaciones.map((i) => i.id)).not.toContain(vieja.importacion.id);
    });

    it('nunca elimina una vigente, por vieja que sea, ni toca los productos', async () => {
      const mes = await importar(PDF_MES_1);
      await aprobarUno(borradorDe(mes.importacion.id, '43873').id);
      const productos = existentes.productos.length;

      reloj.actual = new Date('2040-01-01T00:00:00.000Z');
      expect(await retencion.ejecutar()).toEqual({ eliminadas: 0, fallidas: 0 });

      expect(importaciones.importaciones).toHaveLength(1);
      expect(importaciones.importaciones[0].estado).toBe('VIGENTE');
      expect(existentes.productos).toHaveLength(productos);
    });

    it('conserva los borradores de las importaciones que no vencieron y borra los de las vencidas', async () => {
      const { vieja, nueva } = await conVigenteYArchivada('2026-05-20T10:00:00.000Z');

      reloj.actual = new Date('2026-12-01T00:00:00.000Z');
      await retencion.ejecutar();

      expect(borradores.borradores.filter((b) => b.idImportacion === vieja.importacion.id)).toHaveLength(0);
      expect(borradores.borradores.filter((b) => b.idImportacion === nueva.importacion.id)).toHaveLength(2);
    });

    it('D-57, D-20: IMPORTACION_ELIMINADA con motivo RETENCION, usuario nulo, en transacción y sin nombre de archivo ni contenido', async () => {
      const { vieja } = await conVigenteYArchivada('2026-05-20T10:00:00.000Z');
      reloj.actual = new Date('2026-11-21T00:00:00.000Z');

      await retencion.ejecutar();

      const { actividad, enTransaccion } = auditoria.registradas.at(-1)!;
      expect(enTransaccion).toBe(true);
      expect(actividad).toEqual({
        accion: 'IMPORTACION_ELIMINADA',
        idUsuario: null,
        entidad: 'IMPORTACION',
        idEntidad: vieja.importacion.id,
        detalle: { idImportacion: vieja.importacion.id, motivo: 'RETENCION', borradores: 2 },
      });
      expect(JSON.stringify(actividad)).not.toContain('catalogo-secreto');
    });

    it('es idempotente: una segunda ejecución no elimina ni registra nada', async () => {
      await conVigenteYArchivada('2026-05-20T10:00:00.000Z');
      reloj.actual = new Date('2026-11-21T00:00:00.000Z');

      expect((await retencion.ejecutar()).eliminadas).toBe(1);
      const registradas = auditoria.registradas.length;
      expect(await retencion.ejecutar()).toEqual({ eliminadas: 0, fallidas: 0 });
      expect(auditoria.registradas).toHaveLength(registradas);
    });

    it('varias ejecuciones simultáneas no fallan y la importación se elimina y se registra una sola vez', async () => {
      await conVigenteYArchivada('2026-05-20T10:00:00.000Z');
      reloj.actual = new Date('2026-11-21T00:00:00.000Z');

      const resultados = await Promise.all([
        retencion.ejecutar(),
        retencion.ejecutar(),
        retencion.ejecutar(),
      ]);

      expect(resultados.every((r) => r.fallidas === 0)).toBe(true);
      expect(resultados.reduce((suma, r) => suma + r.eliminadas, 0)).toBe(1);
      expect(
        auditoria.acciones().filter((a) => a === 'IMPORTACION_ELIMINADA'),
      ).toHaveLength(1);
      expect(importaciones.importaciones).toHaveLength(1);
    });

    it('si una importación falla, las demás se eliminan igual y la fallida se cuenta', async () => {
      const { vieja } = await conVigenteYArchivada('2026-05-20T10:00:00.000Z');
      const otra = await importar(PDF_OTRA_MARCA, ID_OTRA_MARCA);
      reloj.actual = new Date('2026-06-01T00:00:00.000Z');
      await importar(Buffer.from('%PDF-1.4 otro mes de la otra marca'), ID_OTRA_MARCA);
      reloj.actual = new Date('2026-12-01T00:00:00.000Z');
      const eliminarOriginal = importaciones.eliminar.bind(importaciones);
      importaciones.eliminar = (id) =>
        id === vieja.importacion.id
          ? Promise.reject(new Error('fallo simulado'))
          : eliminarOriginal(id);

      const resultado = await retencion.ejecutar();

      expect(resultado).toEqual({ eliminadas: 1, fallidas: 1 });
      expect(importaciones.importaciones.map((i) => i.id)).toContain(vieja.importacion.id);
      expect(importaciones.importaciones.map((i) => i.id)).not.toContain(otra.importacion.id);
    });

    it('procesa por lotes pequeños sin perder ninguna importación vencida', async () => {
      const total = TAMANIO_LOTE_RETENCION * 2 + 3;
      reloj.actual = new Date('2026-01-01T00:00:00.000Z');
      for (let i = 0; i < total; i++) {
        await importar(Buffer.from(`%PDF-1.4 mes ${i}`));
      }
      // La última queda vigente; las demás, archivadas en enero.
      reloj.actual = new Date('2026-09-01T00:00:00.000Z');

      const resultado = await retencion.ejecutar();

      expect(resultado).toEqual({ eliminadas: total - 1, fallidas: 0 });
      expect(importaciones.importaciones).toHaveLength(1);
    });
  });
});
