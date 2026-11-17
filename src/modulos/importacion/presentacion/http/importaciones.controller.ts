import {
  Body,
  Controller,
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
import { paginacionDe } from '../../../../compartido/presentacion/paginacion.dto.js';
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
import { ListarBorradoresCasoUso } from '../../aplicacion/casos-uso/listar-borradores.caso-uso.js';
import { ObtenerImportacionCasoUso } from '../../aplicacion/casos-uso/obtener-importacion.caso-uso.js';
import { TAMANIO_MAXIMO_PDF_BYTES } from '../../dominio/archivo-pdf.js';
import { esEstadoBorrador } from '../../dominio/borrador.js';
import {
  ConsultaBorradoresDto,
  CrearImportacionDto,
  EditarBorradorDto,
  IdsBorradoresDto,
} from './dto/importacion.dto.js';
import {
  aRespuestaBorrador,
  aRespuestaImportacion,
  aRespuestaListaBorradores,
  type RespuestaBorrador,
  type RespuestaImportacion,
  type RespuestaListaBorradores,
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
  ) {}

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
        paginacion: paginacionDe(consulta),
      }),
    );
  }
}
