import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { validarMarcaId } from '../../../productos/validaciones.js';
import { validarArchivoPdf, sanearNombreArchivo } from '../../dominio/archivo-pdf.js';
import { Borrador } from '../../dominio/borrador.js';
import {
  ImportacionDuplicadaError,
  MarcaInactivaError,
  MarcaNoEncontradaError,
  PdfIlegibleError,
} from '../../dominio/errores-importacion.js';
import { Importacion } from '../../dominio/importacion.js';
import type { CalculadorTotalesImportacion } from '../calculador-totales.js';
import { leerCatalogo } from '../../dominio/lector-catalogo.js';
import type { CalculadorHuella } from '../puertos/calculador-huella.puerto.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import {
  HuellaDuplicadaError,
  type ImportacionRepositorio,
} from '../puertos/importacion.repositorio.js';
import type { LectorPdf } from '../puertos/lector-pdf.puerto.js';
import type { VistaImportacion } from '../vista-importacion.js';

export interface DatosCrearImportacion {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  marcaId: unknown;
  /** Nombre original del archivo: solo informativo; se sanea. */
  nombreArchivo: unknown;
  /** Bytes del PDF; se procesan en memoria y se descartan (D-49). */
  contenido: Uint8Array;
}

/** Cuántos borradores se insertan por sentencia. */
const LOTE_INSERCION = 100;

/**
 * Analiza un PDF de catálogo y crea la importación con sus borradores
 * (RF-PRO-01, D-49, D-55). Orden de las comprobaciones: marca (404/422),
 * archivo (413/415/422 cifrado), huella repetida (409), lectura (413 páginas,
 * 422 ilegible o sin productos). El PDF **no se guarda**: solo su SHA-256.
 * Importación, borradores y `IMPORTACION_CREADA` van en una transacción; la
 * bitácora no lleva el PDF, su contenido ni su nombre (D-20).
 */
export class CrearImportacionCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly borradores: BorradorRepositorio,
    private readonly marcas: DirectorioMarcas,
    private readonly lector: LectorPdf,
    private readonly huellas: CalculadorHuella,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
    private readonly totales: CalculadorTotalesImportacion,
  ) {}

  async ejecutar(datos: DatosCrearImportacion): Promise<VistaImportacion> {
    const marcaId = validarMarcaId(datos.marcaId);
    const marca = await this.marcas.buscarPorId(marcaId);
    if (marca === null) {
      throw new MarcaNoEncontradaError();
    }
    if (!marca.activa) {
      throw new MarcaInactivaError();
    }

    validarArchivoPdf(datos.contenido);
    const huella = this.huellas.calcular(datos.contenido);
    const existente = await this.importaciones.buscarPorHuella(huella);
    if (existente !== null) {
      throw new ImportacionDuplicadaError(existente.id);
    }

    const paginas = await this.lector.leer(datos.contenido);
    const lectura = leerCatalogo(paginas);
    if (lectura.borradores.length === 0) {
      throw new PdfIlegibleError(
        'No se encontraron productos que importar en el PDF.',
      );
    }

    const ahora = this.reloj.ahora();
    const importacion = Importacion.crear({
      id: this.generadorId.generar(),
      nombreArchivo: sanearNombreArchivo(datos.nombreArchivo),
      huella,
      marcaId: marca.id,
      paginas: paginas.length,
      creadaEn: ahora,
    });
    const borradores = lectura.borradores.map((extraido) =>
      Borrador.desdeExtraccion({
        id: this.generadorId.generar(),
        idImportacion: importacion.id,
        marcaId: marca.id,
        extraido,
        ahora,
      }),
    );

    try {
      await this.unidadTrabajo.ejecutar(async () => {
        // D-57: el catálogo nuevo de la marca archiva el anterior de esa marca.
        await this.importaciones.archivarVigentesDeMarca(marca.id, ahora);
        await this.importaciones.insertar(importacion);
        for (let i = 0; i < borradores.length; i += LOTE_INSERCION) {
          await this.borradores.insertarVarios(
            borradores.slice(i, i + LOTE_INSERCION),
          );
        }
        await this.auditoria.registrar({
          accion: 'IMPORTACION_CREADA',
          idUsuario: datos.idVendedor,
          entidad: 'IMPORTACION',
          idEntidad: importacion.id,
          detalle: {
            idImportacion: importacion.id,
            borradores: borradores.length,
            paginas: paginas.length,
          },
        });
      });
    } catch (error) {
      if (error instanceof HuellaDuplicadaError) {
        // Dos subidas simultáneas del mismo PDF: gana la primera.
        const ganadora = await this.importaciones.buscarPorHuella(huella);
        if (ganadora !== null) {
          throw new ImportacionDuplicadaError(ganadora.id);
        }
      }
      throw error;
    }

    return {
      importacion,
      marca,
      totales: await this.totales.calcular(importacion),
    };
  }
}
