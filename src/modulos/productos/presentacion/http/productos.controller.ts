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
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { paginacionDe } from '../../../../compartido/presentacion/paginacion.dto.js';
import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import { LimiteIntentos } from '../../../../compartido/presentacion/limite-intentos.js';
import { idUuid } from '../../../../compartido/presentacion/id-uuid.js';
import {
  type ActorAutenticado,
  Roles,
  UsuarioActual,
} from '../../../usuarios/index.js';
import { ActualizarProductoCasoUso } from '../../aplicacion/casos-uso/actualizar-producto.caso-uso.js';
import { AgregarImagenCasoUso } from '../../aplicacion/casos-uso/agregar-imagen.caso-uso.js';
import { ConsultarImagenesCasoUso } from '../../aplicacion/casos-uso/consultar-imagenes.caso-uso.js';
import { EliminarImagenCasoUso } from '../../aplicacion/casos-uso/eliminar-imagen.caso-uso.js';
import { ReordenarImagenesCasoUso } from '../../aplicacion/casos-uso/reordenar-imagenes.caso-uso.js';
import { CrearProductoCasoUso } from '../../aplicacion/casos-uso/crear-producto.caso-uso.js';
import { EliminarProductoCasoUso } from '../../aplicacion/casos-uso/eliminar-producto.caso-uso.js';
import { ListarProductosCasoUso } from '../../aplicacion/casos-uso/listar-productos.caso-uso.js';
import { ObtenerProductoCasoUso } from '../../aplicacion/casos-uso/obtener-producto.caso-uso.js';
import { TAMANIO_MAXIMO_IMAGEN_BYTES } from '../../dominio/imagen.js';
import { validarBusqueda } from '../../dominio/busqueda.js';
import { validarDisponibilidad } from '../../dominio/disponibilidad.js';
import {
  ActualizarProductoDto,
  ConsultaProductosDto,
  CrearProductoDto,
  ReordenarImagenesDto,
} from './dto/producto.dto.js';
import {
  aRespuestaImagen,
  aRespuestaListaProductos,
  aRespuestaProducto,
  type RespuestaImagen,
  type RespuestaListaProductos,
  type RespuestaProducto,
} from './respuestas.js';

/** Archivo que entrega Multer en memoria (solo lo que usamos; el nombre original se ignora). */
interface ArchivoSubido {
  buffer?: Uint8Array;
}

/**
 * Rutas de `productos` (contrato de productos, «Endpoints: productos»). La
 * lectura es de cualquier usuario autenticado; crear, cambiar y eliminar son
 * solo del Vendedor (`@Roles('VENDEDOR')`: un Cliente recibe 403 y queda
 * `ACCESO_DENEGADO`, CA-02).
 */
@Controller('productos')
export class ProductosController {
  constructor(
    @Inject(ListarProductosCasoUso)
    private readonly listarProductos: ListarProductosCasoUso,
    @Inject(ObtenerProductoCasoUso)
    private readonly obtenerProducto: ObtenerProductoCasoUso,
    @Inject(CrearProductoCasoUso)
    private readonly crearProducto: CrearProductoCasoUso,
    @Inject(ActualizarProductoCasoUso)
    private readonly actualizarProducto: ActualizarProductoCasoUso,
    @Inject(EliminarProductoCasoUso)
    private readonly eliminarProducto: EliminarProductoCasoUso,
    @Inject(ConsultarImagenesCasoUso)
    private readonly consultarImagenes: ConsultarImagenesCasoUso,
    @Inject(AgregarImagenCasoUso)
    private readonly agregarImagen: AgregarImagenCasoUso,
    @Inject(ReordenarImagenesCasoUso)
    private readonly reordenarImagenes: ReordenarImagenesCasoUso,
    @Inject(EliminarImagenCasoUso)
    private readonly eliminarImagen: EliminarImagenCasoUso,
  ) {}

  /** Imágenes de un producto ya ordenadas, para su respuesta. */
  private async imagenesDe(idProducto: string): Promise<RespuestaImagen[]> {
    const porProducto = await this.consultarImagenes.porProductos([idProducto]);
    return (porProducto.get(idProducto) ?? []).map(aRespuestaImagen);
  }

  /** GET /api/v1/productos — autenticado (RF-PRO-01, RF-CAT-03, RF-INV-03). */
  @Get()
  async listar(
    @UsuarioActual() actor: ActorAutenticado,
    @Query() consulta: ConsultaProductosDto,
  ): Promise<RespuestaListaProductos> {
    const pagina = await this.listarProductos.ejecutar(actor, {
      marcaId: consulta.marcaId,
      clave:
        consulta.busqueda === undefined
          ? undefined
          : validarBusqueda(consulta.busqueda),
      disponibilidad:
        consulta.disponibilidad === undefined
          ? undefined
          : validarDisponibilidad(consulta.disponibilidad),
      paginacion: paginacionDe(consulta),
    });
    const imagenes = await this.consultarImagenes.porProductos(
      pagina.elementos.map((vista) => vista.producto.id),
    );
    return aRespuestaListaProductos(pagina, imagenes);
  }

  /** GET /api/v1/productos/{id} — autenticado. */
  @Get(':id')
  async obtener(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idProducto: string,
  ): Promise<RespuestaProducto> {
    const vista = await this.obtenerProducto.ejecutar(actor, idProducto);
    return aRespuestaProducto(vista, await this.imagenesDe(idProducto));
  }

  /** POST /api/v1/productos — solo el Vendedor (RF-PRO-01, CA-04). */
  @Post()
  @Roles('VENDEDOR')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: CrearProductoDto,
  ): Promise<RespuestaProducto> {
    return aRespuestaProducto(
      await this.crearProducto.ejecutar({
        idVendedor: actor.id,
        nombre: cuerpo.nombre,
        marcaId: cuerpo.marcaId,
        precio: cuerpo.precio,
        descripcion: cuerpo.descripcion,
        disponibilidad: cuerpo.disponibilidad,
      }),
    );
  }

  /** PATCH /api/v1/productos/{id} — solo el Vendedor; cuerpo parcial (CA-05, CA-07). */
  @Patch(':id')
  @Roles('VENDEDOR')
  async actualizar(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idProducto: string,
    @Body() cuerpo: ActualizarProductoDto,
  ): Promise<RespuestaProducto> {
    const vista = await this.actualizarProducto.ejecutar({
      idVendedor: actor.id,
      idProducto,
      cambios: {
        nombre: cuerpo.nombre,
        marcaId: cuerpo.marcaId,
        precio: cuerpo.precio,
        descripcion: cuerpo.descripcion,
        disponibilidad: cuerpo.disponibilidad,
      },
    });
    return aRespuestaProducto(vista, await this.imagenesDe(idProducto));
  }

  /** DELETE /api/v1/productos/{id} — solo el Vendedor; eliminación lógica (CA-06, PA-07). */
  @Delete(':id')
  @Roles('VENDEDOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idProducto: string,
  ): Promise<void> {
    await this.eliminarProducto.ejecutar({ idVendedor: actor.id, idProducto });
  }

  /**
   * POST /api/v1/productos/{id}/imagenes — solo el Vendedor (RF-PRO-01, D-46).
   * `multipart/form-data` con el campo `archivo`. Multer corta en 2 MB (413) y
   * en memoria; el tipo real se valida por firma de bytes en el caso de uso.
   */
  @Post(':id/imagenes')
  @Roles('VENDEDOR')
  @LimiteIntentos('SUBIDA_IMAGENES')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: {
        fileSize: TAMANIO_MAXIMO_IMAGEN_BYTES,
        files: 1,
        fields: 0,
      },
    }),
  )
  async subirImagen(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idProducto: string,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ): Promise<RespuestaImagen> {
    if (archivo === undefined || archivo.buffer === undefined) {
      throw new DatosInvalidosError('Falta el archivo de la imagen.', {
        errores: [
          {
            campo: 'archivo',
            errores: ['Envíe la imagen en el campo archivo.'],
          },
        ],
      });
    }
    return aRespuestaImagen(
      await this.agregarImagen.ejecutar({
        idVendedor: actor.id,
        idProducto,
        contenido: archivo.buffer,
      }),
    );
  }

  /** PUT /api/v1/productos/{id}/imagenes/orden — solo el Vendedor; elige la principal. */
  @Put(':id/imagenes/orden')
  @Roles('VENDEDOR')
  async reordenar(
    @Param('id', idUuid) idProducto: string,
    @Body() cuerpo: ReordenarImagenesDto,
  ): Promise<RespuestaImagen[]> {
    const imagenes = await this.reordenarImagenes.ejecutar({
      idProducto,
      ids: cuerpo.ids.map((id) => id.toLowerCase()),
    });
    return imagenes.map(aRespuestaImagen);
  }

  /** DELETE /api/v1/productos/{id}/imagenes/{imagenId} — solo el Vendedor; borra el archivo. */
  @Delete(':id/imagenes/:imagenId')
  @Roles('VENDEDOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarUnaImagen(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idProducto: string,
    @Param('imagenId', idUuid) idImagen: string,
  ): Promise<void> {
    await this.eliminarImagen.ejecutar({
      idVendedor: actor.id,
      idProducto,
      idImagen: idImagen.toLowerCase(),
    });
  }
}
