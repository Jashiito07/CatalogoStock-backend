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
} from '@nestjs/common';
import { idUuid } from '../../../../compartido/presentacion/id-uuid.js';
import {
  type ActorAutenticado,
  Roles,
  UsuarioActual,
} from '../../../usuarios/index.js';
import { ActualizarMarcaCasoUso } from '../../aplicacion/casos-uso/actualizar-marca.caso-uso.js';
import { CrearMarcaCasoUso } from '../../aplicacion/casos-uso/crear-marca.caso-uso.js';
import { ListarMarcasSugeridasCasoUso } from '../../aplicacion/casos-uso/listar-marcas-sugeridas.caso-uso.js';
import { ListarMarcasCasoUso } from '../../aplicacion/casos-uso/listar-marcas.caso-uso.js';
import {
  ActualizarMarcaDto,
  ConsultaMarcasDto,
  CrearMarcaDto,
} from './dto/marca.dto.js';
import {
  aRespuestaMarca,
  type RespuestaListaMarcas,
  type RespuestaListaSugeridas,
  type RespuestaMarca,
} from './respuestas.js';

/**
 * Rutas de `marcas` (contrato de productos, «Endpoints: marcas»). La lectura
 * es de cualquier usuario autenticado; todo lo demás es solo del Vendedor
 * (`@Roles('VENDEDOR')`: un Cliente recibe 403 y queda `ACCESO_DENEGADO`,
 * CA-02). No existe `DELETE`: una marca se desactiva.
 */
@Controller('marcas')
export class MarcasController {
  constructor(
    @Inject(ListarMarcasCasoUso)
    private readonly listarMarcas: ListarMarcasCasoUso,
    @Inject(ListarMarcasSugeridasCasoUso)
    private readonly listarSugeridas: ListarMarcasSugeridasCasoUso,
    @Inject(CrearMarcaCasoUso)
    private readonly crearMarca: CrearMarcaCasoUso,
    @Inject(ActualizarMarcaCasoUso)
    private readonly actualizarMarca: ActualizarMarcaCasoUso,
  ) {}

  /**
   * GET /api/v1/marcas — autenticado (RF-PRO-04, RF-CAT-05). `incluirInactivas`
   * solo lo respeta el Vendedor; con rol Cliente se ignora.
   */
  @Get()
  async listar(
    @UsuarioActual() actor: ActorAutenticado,
    @Query() consulta: ConsultaMarcasDto,
  ): Promise<RespuestaListaMarcas> {
    const marcas = await this.listarMarcas.ejecutar(
      actor,
      consulta.incluirInactivas ?? false,
    );
    return { elementos: marcas.map(aRespuestaMarca) };
  }

  /** GET /api/v1/marcas/sugeridas — solo el Vendedor (RF-PRO-06, D-48). */
  @Get('sugeridas')
  @Roles('VENDEDOR')
  async sugeridas(): Promise<RespuestaListaSugeridas> {
    return { elementos: await this.listarSugeridas.ejecutar() };
  }

  /** POST /api/v1/marcas — solo el Vendedor (RF-PRO-04, RF-PRO-06). */
  @Post()
  @Roles('VENDEDOR')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: CrearMarcaDto,
  ): Promise<RespuestaMarca> {
    return aRespuestaMarca(
      await this.crearMarca.ejecutar({
        idVendedor: actor.id,
        nombre: cuerpo.nombre,
        color: cuerpo.color,
        colorAcento: cuerpo.colorAcento,
        orden: cuerpo.orden,
      }),
    );
  }

  /** PATCH /api/v1/marcas/{id} — solo el Vendedor; cuerpo parcial. */
  @Patch(':id')
  @Roles('VENDEDOR')
  async actualizar(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idMarca: string,
    @Body() cuerpo: ActualizarMarcaDto,
  ): Promise<RespuestaMarca> {
    return aRespuestaMarca(
      await this.actualizarMarca.ejecutar({
        idVendedor: actor.id,
        idMarca,
        cambios: {
          nombre: cuerpo.nombre,
          color: cuerpo.color,
          colorAcento: cuerpo.colorAcento,
          activa: cuerpo.activa,
          orden: cuerpo.orden,
        },
      }),
    );
  }
}
