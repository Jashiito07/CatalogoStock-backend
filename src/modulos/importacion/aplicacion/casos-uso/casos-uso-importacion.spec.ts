import { crearPaginacion } from '../../../../compartido/dominio/paginacion.js';
import { ErrorDominio, ReglaNegocioError } from '../../../../compartido/dominio/errores.js';
import { PdfIlegibleError } from '../../dominio/errores-importacion.js';
import { CalculadorTotalesImportacion } from '../calculador-totales.js';
import type { BloqueTexto, PaginaTexto } from '../../dominio/texto-pagina.js';
import { AprobarBorradoresCasoUso } from './aprobar-borradores.caso-uso.js';
import { CrearImportacionCasoUso } from './crear-importacion.caso-uso.js';
import { DescartarBorradoresCasoUso } from './descartar-borradores.caso-uso.js';
import {
  AuditoriaFalsa,
  BorradorRepositorioEnMemoria,
  CalculadorHuellaFalso,
  CreadorProductosFalso,
  DirectorioMarcasEnMemoria,
  generadorIdSecuencial,
  ID_MARCA_ACTIVA,
  ID_MARCA_INACTIVA,
  ID_MARCA_INEXISTENTE,
  ID_VENDEDOR,
  ImportacionRepositorioEnMemoria,
  LectorPdfFalso,
  ProductosExistentesFalso,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';
import { EditarBorradorCasoUso } from './editar-borrador.caso-uso.js';
import { ListarBorradoresCasoUso } from './listar-borradores.caso-uso.js';
import { ObtenerImportacionCasoUso } from './obtener-importacion.caso-uso.js';

function l(texto: string, x0: number, base: number, altura = 8): BloqueTexto {
  return { texto, x0, x1: x0 + texto.length * 4, y0: base - altura, y1: base, altura };
}

/** Una página de Yanbal con 3 productos: con oferta, sin precio y sin código. */
const PAGINA_YANBAL: PaginaTexto = {
  numero: 12,
  ancho: 510,
  alto: 708,
  bloques: [
    l('Crema Hidratante Mani', 50, 100),
    l('OFERTA US$ 35.00', 50, 112),
    l('P. Normal US$ 44.00', 50, 122),
    l('CÓD. 43873', 50, 134),
    l('Pág. 12', 50, 144),
    l('Esmalte Color Rosa', 50, 200),
    l('CÓD. 5054', 50, 212),
    l('Jabón Líquido Avena', 50, 300),
    l('OFERTA US$ 5.50', 50, 312),
    l('Pág. 54', 50, 322),
  ],
};

const PDF = Buffer.from('%PDF-1.4 contenido de prueba');

describe('Casos de uso de la importación del catálogo (RF-PRO-01, D-49)', () => {
  let importaciones: ImportacionRepositorioEnMemoria;
  let borradores: BorradorRepositorioEnMemoria;
  let marcas: DirectorioMarcasEnMemoria;
  let lector: LectorPdfFalso;
  let productos: CreadorProductosFalso;
  let existentes: ProductosExistentesFalso;
  let unidad: UnidadDeTrabajoFalsa;
  let auditoria: AuditoriaFalsa;
  let crear: CrearImportacionCasoUso;
  let editar: EditarBorradorCasoUso;
  let aprobar: AprobarBorradoresCasoUso;
  let descartar: DescartarBorradoresCasoUso;
  let listar: ListarBorradoresCasoUso;
  let obtener: ObtenerImportacionCasoUso;

  beforeEach(() => {
    importaciones = new ImportacionRepositorioEnMemoria();
    borradores = new BorradorRepositorioEnMemoria();
    marcas = new DirectorioMarcasEnMemoria();
    lector = new LectorPdfFalso([PAGINA_YANBAL]);
    existentes = new ProductosExistentesFalso();
    productos = new CreadorProductosFalso(existentes);
    unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    const reloj = new RelojFalso();
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
    editar = new EditarBorradorCasoUso(borradores, marcas, existentes, reloj, unidad);
    aprobar = new AprobarBorradoresCasoUso(
      borradores,
      productos,
      existentes,
      marcas,
      reloj,
      unidad,
      auditoria,
    );
    descartar = new DescartarBorradoresCasoUso(borradores, reloj, unidad, auditoria);
    listar = new ListarBorradoresCasoUso(importaciones, borradores, existentes);
    obtener = new ObtenerImportacionCasoUso(
      importaciones,
      new CalculadorTotalesImportacion(borradores, existentes),
      marcas,
    );
  });

  const importar = (extra: Record<string, unknown> = {}) =>
    crear.ejecutar({
      idVendedor: ID_VENDEDOR,
      marcaId: ID_MARCA_ACTIVA,
      nombreArchivo: 'C:\\Descargas\\catalogo-yanbal.pdf',
      contenido: PDF,
      ...extra,
    });

  const idsPendientes = () => borradores.borradores.map((b) => b.id);
  const porCodigo = (codigo: string | null) =>
    borradores.borradores.find((b) => b.codigo === codigo);

  describe('crear la importación', () => {
    it('RF-PRO-01: lee el PDF, crea los borradores PENDIENTE con la marca elegida y devuelve los totales', async () => {
      const vista = await importar();

      expect(vista.importacion.paginas).toBe(1);
      expect(vista.importacion.nombreArchivo).toBe('catalogo-yanbal.pdf');
      expect(vista.marca.nombre).toBe('Yanbal');
      expect(vista.totales).toEqual({
        pendientes: 3,
        aprobados: 0,
        descartados: 0,
        conAdvertencias: 2,
        actualizaran: 0,
        nuevos: 3,
        ausentes: 0,
      });
      expect(borradores.borradores.every((b) => b.marcaId === ID_MARCA_ACTIVA)).toBe(true);
      expect(borradores.borradores.every((b) => b.estado === 'PENDIENTE')).toBe(true);
    });

    it('D-20: IMPORTACION_CREADA lleva solo ids y cantidades, en la misma transacción; nunca el nombre del archivo ni el contenido', async () => {
      const vista = await importar();

      expect(auditoria.registradas).toHaveLength(1);
      const [{ actividad, enTransaccion }] = auditoria.registradas;
      expect(enTransaccion).toBe(true);
      expect(actividad).toEqual({
        accion: 'IMPORTACION_CREADA',
        idUsuario: ID_VENDEDOR,
        entidad: 'IMPORTACION',
        idEntidad: vista.importacion.id,
        detalle: { idImportacion: vista.importacion.id, borradores: 3, paginas: 1 },
      });
      expect(JSON.stringify(actividad)).not.toContain('catalogo-yanbal');
    });

    it('idempotencia: la misma huella dos veces → IMPORTACION_DUPLICADA con el id de la existente y sin leer otra vez', async () => {
      const primera = await importar();
      lector.llamadas = 0;

      await expect(importar()).rejects.toMatchObject({
        codigo: 'IMPORTACION_DUPLICADA',
        categoria: 'CONFLICTO',
        detalles: { idImportacion: primera.importacion.id },
      });
      expect(lector.llamadas).toBe(0);
      expect(importaciones.importaciones).toHaveLength(1);
    });

    it('dos subidas simultáneas del mismo PDF: la que pierde la carrera también recibe 409 con el id de la ganadora', async () => {
      const ganadora = await importar();
      importaciones.ocultarEnLaPrimeraBusqueda = true;

      await expect(importar()).rejects.toMatchObject({
        codigo: 'IMPORTACION_DUPLICADA',
        detalles: { idImportacion: ganadora.importacion.id },
      });
      expect(importaciones.importaciones).toHaveLength(1);
    });

    it('D-48: marca inexistente → MARCA_NO_ENCONTRADA (404); inactiva → MARCA_INACTIVA (422); marcaId que no es UUID → 400; sin leer el PDF', async () => {
      await expect(importar({ marcaId: ID_MARCA_INEXISTENTE })).rejects.toMatchObject({
        codigo: 'MARCA_NO_ENCONTRADA',
        categoria: 'NO_ENCONTRADO',
      });
      await expect(importar({ marcaId: ID_MARCA_INACTIVA })).rejects.toMatchObject({
        codigo: 'MARCA_INACTIVA',
        categoria: 'REGLA_NEGOCIO',
      });
      await expect(importar({ marcaId: 'no-es-uuid' })).rejects.toMatchObject({
        codigo: 'DATOS_INVALIDOS',
      });
      expect(lector.llamadas).toBe(0);
    });

    it('D-46: texto con extensión .pdf → FORMATO_NO_PERMITIDO (415); más de 60 MB → ARCHIVO_DEMASIADO_GRANDE (413); cifrado → PDF_ILEGIBLE (422)', async () => {
      await expect(
        importar({ contenido: Buffer.from('solo texto') }),
      ).rejects.toMatchObject({ codigo: 'FORMATO_NO_PERMITIDO', categoria: 'CONTENIDO_NO_ADMITIDO' });
      const grande = Buffer.alloc(60 * 1024 * 1024 + 1, 0x20);
      Buffer.from('%PDF-1.4').copy(grande);
      await expect(importar({ contenido: grande })).rejects.toMatchObject({
        codigo: 'ARCHIVO_DEMASIADO_GRANDE',
        categoria: 'CONTENIDO_DEMASIADO_GRANDE',
      });
      await expect(
        importar({ contenido: Buffer.from('%PDF-1.4\ntrailer << /Encrypt 5 0 R >>') }),
      ).rejects.toMatchObject({ codigo: 'PDF_ILEGIBLE' });
      expect(importaciones.importaciones).toHaveLength(0);
    });

    it('un PDF que el lector no puede leer, o sin productos reconocibles, es PDF_ILEGIBLE y no deja nada guardado', async () => {
      lector.error = new PdfIlegibleError('dañado');
      await expect(importar()).rejects.toMatchObject({ codigo: 'PDF_ILEGIBLE' });

      lector.error = undefined;
      lector.paginas = [{ numero: 1, ancho: 510, alto: 708, bloques: [l('Solo texto', 10, 20)] }];
      await expect(importar()).rejects.toMatchObject({
        codigo: 'PDF_ILEGIBLE',
        categoria: 'REGLA_NEGOCIO',
      });
      expect(importaciones.importaciones).toHaveLength(0);
      expect(borradores.borradores).toHaveLength(0);
      expect(auditoria.registradas).toHaveLength(0);
    });

  });

  describe('consultar', () => {
    it('obtener devuelve la importación con sus totales; 404 si no existe', async () => {
      const { importacion } = await importar();

      const vista = await obtener.ejecutar(importacion.id, ID_VENDEDOR);
      expect(vista.totales.pendientes).toBe(3);
      await expect(
        obtener.ejecutar('00000000-0000-4000-8000-000000000999', ID_VENDEDOR),
      ).rejects.toMatchObject({ categoria: 'NO_ENCONTRADO' });
    });

    it('listar: PENDIENTE por defecto, filtros de advertencias, texto sin tildes y página del PDF; 404 si la importación no existe', async () => {
      const { importacion } = await importar();
      const base = { idVendedor: ID_VENDEDOR, idImportacion: importacion.id, paginacion: crearPaginacion() };

      expect((await listar.ejecutar(base)).total).toBe(3);
      expect((await listar.ejecutar({ ...base, conAdvertencias: true })).total).toBe(2);
      expect((await listar.ejecutar({ ...base, conAdvertencias: false })).total).toBe(1);
      expect((await listar.ejecutar({ ...base, clave: 'jabon liquido' })).elementos[0].nombre).toBe(
        'Jabón Líquido Avena',
      );
      expect((await listar.ejecutar({ ...base, clave: '5054' })).total).toBe(1);
      expect((await listar.ejecutar({ ...base, paginaPdf: 99 })).total).toBe(0);
      expect((await listar.ejecutar({ ...base, estado: 'APROBADO' })).total).toBe(0);
      await expect(
        listar.ejecutar({ ...base, idImportacion: '00000000-0000-4000-8000-000000000999' }),
      ).rejects.toMatchObject({ categoria: 'NO_ENCONTRADO' });
    });
  });

  describe('RN-11: editar', () => {
    it('precio con 3 decimales → 400; marca inactiva → MARCA_INACTIVA; marca inexistente → MARCA_NO_ENCONTRADA; borrador inexistente → 404', async () => {
      await importar();
      const id = porCodigo('43873')!.id;

      await expect(
        editar.ejecutar({ idVendedor: ID_VENDEDOR, idBorrador: id, cambios: { precio: '12.505' } }),
      ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
      await expect(
        editar.ejecutar({ idVendedor: ID_VENDEDOR, idBorrador: id, cambios: { marcaId: ID_MARCA_INACTIVA } }),
      ).rejects.toMatchObject({ codigo: 'MARCA_INACTIVA' });
      await expect(
        editar.ejecutar({ idVendedor: ID_VENDEDOR, idBorrador: id, cambios: { marcaId: ID_MARCA_INEXISTENTE } }),
      ).rejects.toMatchObject({ codigo: 'MARCA_NO_ENCONTRADA' });
      await expect(
        editar.ejecutar({
          idVendedor: ID_VENDEDOR,
          idBorrador: '00000000-0000-4000-8000-000000000999',
          cambios: { precio: '1' },
        }),
      ).rejects.toMatchObject({ categoria: 'NO_ENCONTRADO' });
      expect(porCodigo('43873')?.precio?.aTexto()).toBe('35.00');
    });

    it('guarda el cambio y recalcula las advertencias; editar uno aprobado → BORRADOR_NO_EDITABLE', async () => {
      await importar();
      const sinPrecio = porCodigo('5054')!;
      expect(sinPrecio.advertencias).toEqual(['SIN_PRECIO']);

      const publico = await editar.ejecutar({
        idVendedor: ID_VENDEDOR,
        idBorrador: sinPrecio.id,
        cambios: { precio: '9.9', nombre: 'Esmalte Rosa Pastel' },
      });
      expect(publico.precio?.aTexto()).toBe('9.90');
      expect(publico.advertencias).toEqual([]);

      await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [sinPrecio.id] });
      await expect(
        editar.ejecutar({ idVendedor: ID_VENDEDOR, idBorrador: sinPrecio.id, cambios: { precio: '1' } }),
      ).rejects.toMatchObject({ codigo: 'BORRADOR_NO_EDITABLE', categoria: 'REGLA_NEGOCIO' });
    });
  });

  describe('aprobar', () => {
    it('RF-PRO-01, D-57: crea el producto con su código en la columna (la descripción ya no lleva «Cód.»), marca el borrador APROBADO y registra BORRADORES_APROBADOS', async () => {
      const { importacion } = await importar();
      const borrador = porCodigo('43873')!;

      const resultados = await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [borrador.id] });

      expect(resultados).toEqual([
        {
          id: borrador.id,
          estado: 'APROBADO',
          idProducto: expect.any(String),
          accion: 'CREADO',
          emparejadoPor: null,
        },
      ]);
      expect(productos.creados).toEqual([
        {
          idVendedor: ID_VENDEDOR,
          nombre: 'Crema Hidratante Mani',
          codigo: '43873',
          marcaId: ID_MARCA_ACTIVA,
          precio: '35.00',
          descripcion: '',
          disponibilidad: 'DISPONIBLE',
        },
      ]);
      expect(porCodigo('43873')?.estado).toBe('APROBADO');
      const registro = auditoria.registradas.at(-1)!.actividad;
      expect(registro).toMatchObject({
        accion: 'BORRADORES_APROBADOS',
        entidad: 'IMPORTACION',
        idEntidad: importacion.id,
        detalle: { idImportacion: importacion.id, cantidad: 1 },
      });
    });

    it('idempotente: aprobar de nuevo responde NO_PENDIENTE y no duplica el producto', async () => {
      await importar();
      const id = porCodigo('43873')!.id;

      await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [id] });
      const segunda = await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [id, id] });

      expect(segunda).toEqual([
        { id, error: 'NO_PENDIENTE' },
        { id, error: 'NO_PENDIENTE' },
      ]);
      expect(productos.creados).toHaveLength(1);
      expect(auditoria.acciones().filter((a) => a === 'BORRADORES_APROBADOS')).toHaveLength(1);
    });

    it('RN-11: sin precio no se aprueba (SIN_PRECIO); inexistente → NO_ENCONTRADO; no se registra BORRADORES_APROBADOS si no se aprobó ninguno', async () => {
      await importar();
      const sinPrecio = porCodigo('5054')!;

      const resultados = await aprobar.ejecutar({
        idVendedor: ID_VENDEDOR,
        ids: [sinPrecio.id, '00000000-0000-4000-8000-000000000999'],
      });

      expect(resultados).toEqual([
        { id: sinPrecio.id, error: 'SIN_PRECIO' },
        { id: '00000000-0000-4000-8000-000000000999', error: 'NO_ENCONTRADO' },
      ]);
      expect(productos.creados).toHaveLength(0);
      expect(auditoria.acciones()).not.toContain('BORRADORES_APROBADOS');
    });

    it('transacción por borrador: un fallo (MARCA_INACTIVA) no deshace los demás aprobados', async () => {
      await importar();
      const buenos = [porCodigo('43873')!, porCodigo(null)!];
      const malo = borradores.borradores.find((b) => b.codigo === '5054')!;
      await editar.ejecutar({ idVendedor: ID_VENDEDOR, idBorrador: malo.id, cambios: { precio: '3' } });
      productos.fallos.set(
        'Esmalte Color Rosa',
        new (class extends ReglaNegocioError {})('MARCA_INACTIVA', 'La marca está desactivada.'),
      );

      const resultados = await aprobar.ejecutar({
        idVendedor: ID_VENDEDOR,
        ids: [buenos[0].id, malo.id, buenos[1].id],
      });

      expect(resultados.map((r) => ('error' in r ? r.error : r.estado))).toEqual([
        'APROBADO',
        'MARCA_INACTIVA',
        'APROBADO',
      ]);
      expect(porCodigo('5054')?.estado).toBe('PENDIENTE');
      expect(productos.creados).toHaveLength(2);
      expect(auditoria.registradas.at(-1)!.actividad.detalle).toMatchObject({ cantidad: 2 });
    });

    it('un error que no es de dominio no se oculta', async () => {
      await importar();
      const id = porCodigo('43873')!.id;
      productos.fallos.set(
        'Crema Hidratante Mani',
        new (class extends ErrorDominio {
          readonly categoria = 'SERVICIO_NO_DISPONIBLE';
        })('OTRO', 'otro'),
      );

      await expect(
        aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [id] }),
      ).rejects.toMatchObject({ codigo: 'OTRO' });
    });
  });

  describe('descartar', () => {
    it('marca DESCARTADO, registra BORRADORES_DESCARTADOS y después ya no se puede aprobar ni editar', async () => {
      const { importacion } = await importar();
      const [uno, dos] = idsPendientes();

      const resultados = await descartar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [uno] });
      expect(resultados).toEqual([{ id: uno, estado: 'DESCARTADO' }]);
      expect(auditoria.registradas.at(-1)!.actividad).toMatchObject({
        accion: 'BORRADORES_DESCARTADOS',
        entidad: 'IMPORTACION',
        idEntidad: importacion.id,
        detalle: { idImportacion: importacion.id, cantidad: 1 },
      });

      expect(await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [uno] })).toEqual([
        { id: uno, error: 'NO_PENDIENTE' },
      ]);
      expect(await descartar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [uno, dos] })).toEqual([
        { id: uno, error: 'NO_PENDIENTE' },
        { id: dos, estado: 'DESCARTADO' },
      ]);
      expect(productos.creados).toHaveLength(0);
      await expect(
        editar.ejecutar({ idVendedor: ID_VENDEDOR, idBorrador: uno, cambios: { precio: '1' } }),
      ).rejects.toMatchObject({ codigo: 'BORRADOR_NO_EDITABLE' });
    });
  });
});
