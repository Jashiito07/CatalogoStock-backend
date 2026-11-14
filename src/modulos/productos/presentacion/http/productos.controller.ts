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
} from '@nestjs/common';
import { paginacionDe } from '../../../../compartido/presentacion/paginacion.dto.js';
import { idUuid } from '../../../../compartido/presentacion/id-uuid.js';
import {
  type ActorAutenticado,
  Roles,
  UsuarioActual,
} from '../../../usuarios/index.js';
import { ActualizarProductoCasoUso } from '../../aplicacion/casos-uso/actualizar-producto.caso-uso.js';
import { CrearProductoCasoUso } from '../../aplicacion/casos-uso/crear-producto.caso-uso.js';
import { EliminarProductoCasoUso } from '../../aplicacion/casos-uso/eliminar-producto.caso-uso.js';
import { ListarProductosCasoUso } from '../../aplicacion/casos-uso/listar-productos.caso-uso.js';
import { ObtenerProductoCasoUso } from '../../aplicacion/casos-uso/obtener-producto.caso-uso.js';
import { validarBusqueda } from '../../dominio/busqueda.js';
import { validarDisponibilidad } from '../../dominio/disponibilidad.js';
import {
  ActualizarProductoDto,
  ConsultaProductosDto,
  CrearProductoDto,
} from './dto/producto.dto.js';
import {
  aRespuestaListaProductos,
  aRespuestaProducto,
  type RespuestaListaProductos,
  type RespuestaProducto,
} from './respuestas.js';

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
  ) {}

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
    return aRespuestaListaProductos(pagina);
  }

  /** GET /api/v1/productos/{id} — autenticado. */
  @Get(':id')
  async obtener(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idProducto: string,
  ): Promise<RespuestaProducto> {
    return aRespuestaProducto(
      await this.obtenerProducto.ejecutar(actor, idProducto),
    );
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
    return aRespuestaProducto(
      await this.actualizarProducto.ejecutar({
        idVendedor: actor.id,
        idProducto,
        cambios: {
          nombre: cuerpo.nombre,
          marcaId: cuerpo.marcaId,
          precio: cuerpo.precio,
          descripcion: cuerpo.descripcion,
          disponibilidad: cuerpo.disponibilidad,
        },
      }),
    );
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
}
