import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import { idUuid } from '../../../../compartido/presentacion/id-uuid.js';
import { LimiteIntentos } from '../../../../compartido/presentacion/limite-intentos.js';
import {
  PaginacionDto,
  paginacionDe,
} from '../../../../compartido/presentacion/paginacion.dto.js';
import { claveDeBusqueda } from '../../../productos/validaciones.js';
import {
  type ActorAutenticado,
  Roles,
  UsuarioActual,
} from '../../../usuarios/index.js';
import { AprobarBorradoresCasoUso } from '../../aplicacion/casos-uso/aprobar-borradores.caso-uso.js';
import { CrearImportacionCasoUso } from '../../aplicacion/casos-uso/crear-importacion.caso-uso.js';
import { DescartarBorradoresCasoUso } from '../../aplicacion/casos-uso/descartar-borradores.caso-uso.js';
import { EditarBorradorCasoUso } from '../../aplicacion/casos-uso/editar-borrador.caso-uso.js';
import { EliminarImportacionCasoUso } from '../../aplicacion/casos-uso/eliminar-importacion.caso-uso.js';
import { ListarAusentesCasoUso } from '../../aplicacion/casos-uso/listar-ausentes.caso-uso.js';
import { ListarBorradoresCasoUso } from '../../aplicacion/casos-uso/listar-borradores.caso-uso.js';
import { ListarImportacionesCasoUso } from '../../aplicacion/casos-uso/listar-importaciones.caso-uso.js';
import { ObtenerImportacionCasoUso } from '../../aplicacion/casos-uso/obtener-importacion.caso-uso.js';
import { TAMANIO_MAXIMO_PDF_BYTES } from '../../dominio/archivo-pdf.js';
import { esAccionRevision } from '../../dominio/accion-revision.js';
import { esEstadoBorrador } from '../../dominio/borrador.js';
import { esEstadoImportacion } from '../../dominio/importacion.js';
import {
  ConsultaBorradoresDto,
  ConsultaImportacionesDto,
  CrearImportacionDto,
  EditarBorradorDto,
  IdsBorradoresDto,
} from './dto/importacion.dto.js';
import {
  aRespuestaBorrador,
  aRespuestaImportacion,
  aRespuestaListaAusentes,
  aRespuestaListaBorradores,
  aRespuestaListaImportaciones,
  type RespuestaBorrador,
  type RespuestaImportacion,
  type RespuestaListaAusentes,
  type RespuestaListaBorradores,
  type RespuestaListaImportaciones,
} from './respuestas.js';

/** Archivo que entrega Multer en memoria (solo lo que usamos). */
interface ArchivoSubido {
  buffer?: Uint8Array;
  /** Solo informativo; se sanea antes de guardarlo. */
  originalname?: string;
}

/**
 * Rutas de la importación asistida del catálogo en PDF (contrato
 * `productos-importacion`, RF-PRO-01, D-49, D-55). Todas son del Vendedor
 * (`@Roles('VENDEDOR')` en el controlador: un Cliente recibe 403 y queda
 * `ACCESO_DENEGADO`, CA-02).
 */
@Controller('productos/importaciones')
@Roles('VENDEDOR')
export class ImportacionesController {
  constructor(
    @Inject(CrearImportacionCasoUso)
    private readonly crearImportacion: CrearImportacionCasoUso,
    @Inject(ObtenerImportacionCasoUso)
    private readonly obtenerImportacion: ObtenerImportacionCasoUso,
    @Inject(ListarBorradoresCasoUso)
    private readonly listarBorradores: ListarBorradoresCasoUso,
    @Inject(EditarBorradorCasoUso)
    private readonly editarBorrador: EditarBorradorCasoUso,
    @Inject(AprobarBorradoresCasoUso)
    private readonly aprobarBorradores: AprobarBorradoresCasoUso,
    @Inject(DescartarBorradoresCasoUso)
    private readonly descartarBorradores: DescartarBorradoresCasoUso,
    @Inject(ListarImportacionesCasoUso)
    private readonly listarImportaciones: ListarImportacionesCasoUso,
    @Inject(ListarAusentesCasoUso)
    private readonly listarAusentes: ListarAusentesCasoUso,
    @Inject(EliminarImportacionCasoUso)
    private readonly eliminarImportacion: EliminarImportacionCasoUso,
  ) {}

  /**
   * GET /api/v1/productos/importaciones (D-57): lista paginada, la más
   * reciente primero; filtros `estado` y `marcaId`.
   */
  @Get()
  async listarTodas(
    @Query() consulta: ConsultaImportacionesDto,
  ): Promise<RespuestaListaImportaciones> {
    return aRespuestaListaImportaciones(
      await this.listarImportaciones.ejecutar({
        estado:
          consulta.estado !== undefined && esEstadoImportacion(consulta.estado)
            ? consulta.estado
            : undefined,
        marcaId: consulta.marcaId?.toLowerCase(),
        paginacion: paginacionDe(consulta),
      }),
    );
  }

  /**
   * POST /api/v1/productos/importaciones - `multipart/form-data` con el campo
   * `archivo` (PDF) y `marcaId`. Multer corta en 60 MB (413) y en memoria; la
   * firma `%PDF-`, el cifrado y las páginas se validan en el caso de uso. El
   * PDF no se guarda en disco: se procesa y se descarta.
   */
  @Post()
  @LimiteIntentos('IMPORTACION_PDF')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: TAMANIO_MAXIMO_PDF_BYTES, files: 1, fields: 1 },
    }),
  )
  async crear(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: CrearImportacionDto,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ): Promise<RespuestaImportacion> {
    if (archivo === undefined || archivo.buffer === undefined) {
      throw new DatosInvalidosError('Falta el archivo PDF.', {
        errores: [
          {
            campo: 'archivo',
            errores: ['Envíe el PDF en el campo archivo.'],
          },
        ],
      });
    }
    return aRespuestaImportacion(
      await this.crearImportacion.ejecutar({
        idVendedor: actor.id,
        marcaId: cuerpo.marcaId,
        nombreArchivo: archivo.originalname,
        contenido: archivo.buffer,
      }),
    );
  }

  /** POST /api/v1/productos/importaciones/borradores/aprobar */
  @Post('borradores/aprobar')
  @HttpCode(HttpStatus.OK)
  async aprobar(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: IdsBorradoresDto,
  ): Promise<{ resultados: unknown[] }> {
    return {
      resultados: await this.aprobarBorradores.ejecutar({
        idVendedor: actor.id,
        ids: cuerpo.ids.map((id) => id.toLowerCase()),
      }),
    };
  }

  /** POST /api/v1/productos/importaciones/borradores/descartar */
  @Post('borradores/descartar')
  @HttpCode(HttpStatus.OK)
  async descartar(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: IdsBorradoresDto,
  ): Promise<{ resultados: unknown[] }> {
    return {
      resultados: await this.descartarBorradores.ejecutar({
        idVendedor: actor.id,
        ids: cuerpo.ids.map((id) => id.toLowerCase()),
      }),
    };
  }

  /** PATCH /api/v1/productos/importaciones/borradores/{borradorId} */
  @Patch('borradores/:borradorId')
  async editar(
    @Param('borradorId', idUuid) idBorrador: string,
    @Body() cuerpo: EditarBorradorDto,
  ): Promise<RespuestaBorrador> {
    return aRespuestaBorrador(
      await this.editarBorrador.ejecutar({
        idBorrador: idBorrador.toLowerCase(),
        cambios: {
          nombre: cuerpo.nombre,
          descripcion: cuerpo.descripcion,
          precio: cuerpo.precio,
          marcaId: cuerpo.marcaId,
          disponibilidad: cuerpo.disponibilidad,
        },
      }),
    );
  }

  /** GET /api/v1/productos/importaciones/{id} */
  @Get(':id')
  async obtener(
    @Param('id', idUuid) idImportacion: string,
  ): Promise<RespuestaImportacion> {
    return aRespuestaImportacion(
      await this.obtenerImportacion.ejecutar(idImportacion.toLowerCase()),
    );
  }

  /**
   * DELETE /api/v1/productos/importaciones/{id} (D-57): elimina la
   * importación y sus borradores, nunca los productos; libera la huella.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idImportacion: string,
  ): Promise<void> {
    await this.eliminarImportacion.ejecutar({
      idVendedor: actor.id,
      idImportacion: idImportacion.toLowerCase(),
    });
  }

  /**
   * GET /api/v1/productos/importaciones/{id}/ausentes (D-57): productos de la
   * marca con código que no aparecen en la importación vigente. Solo informa.
   */
  @Get(':id/ausentes')
  async ausentes(
    @Param('id', idUuid) idImportacion: string,
    @Query() consulta: PaginacionDto,
  ): Promise<RespuestaListaAusentes> {
    return aRespuestaListaAusentes(
      await this.listarAusentes.ejecutar(
        idImportacion.toLowerCase(),
        paginacionDe(consulta),
      ),
    );
  }

  /** GET /api/v1/productos/importaciones/{id}/borradores */
  @Get(':id/borradores')
  async listar(
    @Param('id', idUuid) idImportacion: string,
    @Query() consulta: ConsultaBorradoresDto,
  ): Promise<RespuestaListaBorradores> {
    return aRespuestaListaBorradores(
      await this.listarBorradores.ejecutar({
        idImportacion: idImportacion.toLowerCase(),
        estado:
          consulta.estado !== undefined && esEstadoBorrador(consulta.estado)
            ? consulta.estado
            : undefined,
        conAdvertencias: consulta.conAdvertencias,
        clave:
          consulta.busqueda === undefined
            ? undefined
            : claveDeBusqueda(consulta.busqueda),
        paginaPdf: consulta.paginaPdf,
        accion:
          consulta.accion !== undefined && esAccionRevision(consulta.accion)
            ? consulta.accion
            : undefined,
        paginacion: paginacionDe(consulta),
      }),
    );
  }
}
