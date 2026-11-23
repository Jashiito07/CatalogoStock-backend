import { crearPaginacion } from '../../../../compartido/dominio/paginacion.js';
import type { BloqueTexto, PaginaTexto } from '../../dominio/texto-pagina.js';
import { CalculadorTotalesImportacion } from '../calculador-totales.js';
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
  ID_VENDEDOR,
  ImportacionRepositorioEnMemoria,
  LectorPdfFalso,
  ProductosExistentesFalso,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';
import { EliminarImportacionCasoUso } from './eliminar-importacion.caso-uso.js';
import { ListarAusentesCasoUso } from './listar-ausentes.caso-uso.js';
import { ListarBorradoresCasoUso } from './listar-borradores.caso-uso.js';
import { ListarImportacionesCasoUso } from './listar-importaciones.caso-uso.js';
import { ObtenerImportacionCasoUso } from './obtener-importacion.caso-uso.js';

const OTRO_VENDEDOR = '00000000-0000-4000-8000-0000000000ab';
const PDF = Buffer.from('%PDF-1.4 catalogo compartido');

function l(texto: string, x0: number, base: number): BloqueTexto {
  return { texto, x0, x1: x0 + texto.length * 4, y0: base - 8, y1: base, altura: 8 };
}

const PAGINA: PaginaTexto = {
  numero: 12,
  ancho: 510,
  alto: 708,
  bloques: [
    l('Crema Hidratante Mani', 50, 100),
    l('OFERTA US$ 35.00', 50, 112),
    l('CÓD. 43873', 50, 134),
  ],
};

describe('D-60: propiedad de las importaciones y los borradores por Vendedor', () => {
  let importaciones: ImportacionRepositorioEnMemoria;
  let borradores: BorradorRepositorioEnMemoria;
  let existentes: ProductosExistentesFalso;
  let crear: CrearImportacionCasoUso;
  let aprobar: AprobarBorradoresCasoUso;
  let descartar: DescartarBorradoresCasoUso;
  let listarBorradores: ListarBorradoresCasoUso;
  let listarImportaciones: ListarImportacionesCasoUso;
  let obtener: ObtenerImportacionCasoUso;
  let ausentes: ListarAusentesCasoUso;
  let eliminar: EliminarImportacionCasoUso;

  beforeEach(() => {
    importaciones = new ImportacionRepositorioEnMemoria();
    borradores = new BorradorRepositorioEnMemoria();
    const marcas = new DirectorioMarcasEnMemoria();
    existentes = new ProductosExistentesFalso();
    const creador = new CreadorProductosFalso(existentes);
    const unidad = new UnidadDeTrabajoFalsa();
    const auditoria = new AuditoriaFalsa(unidad);
    const reloj = new RelojFalso();
    const totales = new CalculadorTotalesImportacion(borradores, existentes);
    crear = new CrearImportacionCasoUso(
      importaciones,
      new Proxy(borradores, {
        // El doble de borradores sabe de quién es cada importación al insertarla.
        get(destino, propiedad, receptor) {
          if (propiedad === 'insertarVarios') {
            return async (nuevos: Parameters<typeof destino.insertarVarios>[0]) => {
              for (const b of nuevos) {
                const dueno = importaciones.importaciones.find((i) => i.id === b.idImportacion);
                if (dueno) {
                  destino.asignarPropietario(dueno.id, dueno.idVendedor);
                }
              }
              await destino.insertarVarios(nuevos);
            };
          }
          return Reflect.get(destino, propiedad, receptor) as unknown;
        },
      }),
      marcas,
      new LectorPdfFalso([PAGINA]),
      new CalculadorHuellaFalso(),
      generadorIdSecuencial(),
      reloj,
      unidad,
      auditoria,
      totales,
    );
    aprobar = new AprobarBorradoresCasoUso(borradores, creador, existentes, marcas, reloj, unidad, auditoria);
    descartar = new DescartarBorradoresCasoUso(borradores, reloj, unidad, auditoria);
    listarBorradores = new ListarBorradoresCasoUso(importaciones, borradores, existentes);
    listarImportaciones = new ListarImportacionesCasoUso(importaciones, totales, marcas);
    obtener = new ObtenerImportacionCasoUso(importaciones, totales, marcas);
    ausentes = new ListarAusentesCasoUso(importaciones, borradores, existentes);
    eliminar = new EliminarImportacionCasoUso(importaciones, borradores, unidad, auditoria);
  });

  const importar = (idVendedor: string) =>
    crear.ejecutar({ idVendedor, marcaId: ID_MARCA_ACTIVA, nombreArchivo: 'c.pdf', contenido: PDF });

  it('la importación nueva lleva el Vendedor autenticado como dueño', async () => {
    const vista = await importar(ID_VENDEDOR);
    expect(vista.importacion.idVendedor).toBe(ID_VENDEDOR);
  });

  it('el mismo PDF de dos Vendedores no choca: cada uno tiene su importación vigente en la marca', async () => {
    const a = await importar(ID_VENDEDOR);
    const b = await importar(OTRO_VENDEDOR);
    expect(b.importacion.id).not.toBe(a.importacion.id);
    expect(importaciones.importaciones.map((i) => i.estado)).toEqual(['VIGENTE', 'VIGENTE']);
    // El mismo Vendedor sí repite: 409 sin revelar la de otro.
    await expect(importar(ID_VENDEDOR)).rejects.toMatchObject({ codigo: 'IMPORTACION_DUPLICADA' });
  });

  it('un segundo Vendedor recibe 404 al consultar, listar borradores, ver ausentes o eliminar la del primero, y no la ve en su lista', async () => {
    const { importacion } = await importar(ID_VENDEDOR);
    const NO_ENCONTRADA = { codigo: 'NO_ENCONTRADO', categoria: 'NO_ENCONTRADO' };

    await expect(obtener.ejecutar(importacion.id, OTRO_VENDEDOR)).rejects.toMatchObject(NO_ENCONTRADA);
    await expect(
      listarBorradores.ejecutar({
        idVendedor: OTRO_VENDEDOR,
        idImportacion: importacion.id,
        paginacion: crearPaginacion(),
      }),
    ).rejects.toMatchObject(NO_ENCONTRADA);
    await expect(
      ausentes.ejecutar(importacion.id, OTRO_VENDEDOR, crearPaginacion()),
    ).rejects.toMatchObject(NO_ENCONTRADA);
    await expect(
      eliminar.ejecutar({ idVendedor: OTRO_VENDEDOR, idImportacion: importacion.id }),
    ).rejects.toMatchObject(NO_ENCONTRADA);
    expect(
      (await listarImportaciones.ejecutar({ idVendedor: OTRO_VENDEDOR, paginacion: crearPaginacion() })).total,
    ).toBe(0);
    expect(
      (await listarImportaciones.ejecutar({ idVendedor: ID_VENDEDOR, paginacion: crearPaginacion() })).total,
    ).toBe(1);
    // Nada cambió.
    expect(importaciones.importaciones).toHaveLength(1);
  });

  it('aprobar o descartar un borrador de otro Vendedor responde NO_ENCONTRADO y no crea productos', async () => {
    const { importacion } = await importar(ID_VENDEDOR);
    const idBorrador = borradores.borradores.find((b) => b.idImportacion === importacion.id)!.id;

    const aprobacion = await aprobar.ejecutar({ idVendedor: OTRO_VENDEDOR, ids: [idBorrador] });
    const descarte = await descartar.ejecutar({ idVendedor: OTRO_VENDEDOR, ids: [idBorrador] });

    expect(aprobacion).toEqual([{ id: idBorrador, error: 'NO_ENCONTRADO' }]);
    expect(descarte).toEqual([{ id: idBorrador, error: 'NO_ENCONTRADO' }]);
    expect(existentes.productos).toHaveLength(0);
    expect(borradores.borradores.find((b) => b.id === idBorrador)?.estado).toBe('PENDIENTE');
  });

  it('el emparejamiento por código solo ve los productos del propio Vendedor', async () => {
    existentes.agregar({ codigo: '43873', idVendedor: OTRO_VENDEDOR });
    const { importacion } = await importar(ID_VENDEDOR);
    const idBorrador = borradores.borradores.find((b) => b.idImportacion === importacion.id)!.id;

    const [resultado] = await aprobar.ejecutar({ idVendedor: ID_VENDEDOR, ids: [idBorrador] });

    // No actualiza el producto del otro Vendedor: crea uno propio.
    expect(resultado).toMatchObject({ estado: 'APROBADO', accion: 'CREADO' });
    expect(existentes.actualizaciones).toHaveLength(0);
  });
});
