import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { LimiteIntentos } from '../../../../compartido/presentacion/limite-intentos.js';
import { paginacionDe } from '../../../../compartido/presentacion/paginacion.dto.js';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import type { RespuestaError } from '../../../../compartido/presentacion/respuesta-error.js';
import { MENSAJES_HTTP } from '../../../../compartido/presentacion/respuesta-error.js';
import { CambiarClaveCasoUso } from '../../aplicacion/casos-uso/cambiar-clave.caso-uso.js';
import { ConsultarUsuarioActualCasoUso } from '../../aplicacion/casos-uso/consultar-usuario-actual.caso-uso.js';
import { GenerarCodigoRecuperacionCasoUso } from '../../aplicacion/casos-uso/generar-codigo-recuperacion.caso-uso.js';
import { ListarClientesCasoUso } from '../../aplicacion/casos-uso/listar-clientes.caso-uso.js';
import { RegistrarClienteCasoUso } from '../../aplicacion/casos-uso/registrar-cliente.caso-uso.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import { CambioClaveDto } from './dto/clave.dto.js';
import { ConsultaClientesDto } from './dto/consulta-clientes.dto.js';
import { RegistroClienteDto } from './dto/registro-cliente.dto.js';
import {
  aRespuestaCodigoGenerado,
  aRespuestaPaginaClientes,
  aRespuestaUsuario,
  type RespuestaCodigoGenerado,
  type RespuestaPaginaClientes,
  type RespuestaUsuario,
} from './respuestas.js';
import { Roles } from './roles.js';
import { UsuarioActual } from './usuario-actual.js';

export const MENSAJE_ID_UUID = 'El identificador debe ser un UUID.';

/** `{id}` que no es un UUID → 400 `DATOS_INVALIDOS` con el formato del contrato. */
const idUuid = new ParseUUIDPipe({
  exceptionFactory: () => {
    const cuerpo: RespuestaError = {
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_HTTP[400],
      detalles: { errores: [{ campo: 'id', errores: [MENSAJE_ID_UUID] }] },
    };
    return new BadRequestException(cuerpo);
  },
});

/** Rutas de `usuarios` (contratos de usuarios y de recuperación de clave). */
@Controller('usuarios')
export class UsuariosController {
  constructor(
    @Inject(RegistrarClienteCasoUso)
    private readonly registrarCliente: RegistrarClienteCasoUso,
    @Inject(ConsultarUsuarioActualCasoUso)
    private readonly consultarUsuarioActual: ConsultarUsuarioActualCasoUso,
    @Inject(ListarClientesCasoUso)
    private readonly listarClientes: ListarClientesCasoUso,
    @Inject(GenerarCodigoRecuperacionCasoUso)
    private readonly generarCodigo: GenerarCodigoRecuperacionCasoUso,
    @Inject(CambiarClaveCasoUso)
    private readonly cambiarClave: CambiarClaveCasoUso,
  ) {}

  /**
   * POST /api/v1/usuarios/registro — público (RF-USU-01, RF-USU-02, RNF-16,
   * D-07, D-11). Siempre crea un Cliente; no inicia sesión. 3 por minuto por IP (D-17).
   */
  @Post('registro')
  @Publico()
  @HttpCode(HttpStatus.CREATED)
  @LimiteIntentos('REGISTRO')
  async registrar(
    @Body() cuerpo: RegistroClienteDto,
  ): Promise<RespuestaUsuario> {
    const usuario = await this.registrarCliente.ejecutar({
      nombre: cuerpo.nombre,
      correo: cuerpo.correo,
      telefono: cuerpo.telefono,
      clave: cuerpo.clave,
      aceptaPrivacidad: cuerpo.aceptaPrivacidad,
      versionPrivacidad: cuerpo.versionPrivacidad,
    });
    return aRespuestaUsuario(usuario);
  }

  /**
   * GET /api/v1/usuarios — solo el Vendedor (RF-USU-05, sección «Clientes»;
   * RF-USU-03, CA-02). Lista solo Clientes, paginada y con búsqueda. Un
   * Cliente recibe 403 y queda `ACCESO_DENEGADO` (guard global de roles).
   */
  @Get()
  @Roles('VENDEDOR')
  async listar(
    @Query() consulta: ConsultaClientesDto,
  ): Promise<RespuestaPaginaClientes> {
    return aRespuestaPaginaClientes(
      await this.listarClientes.ejecutar(
        consulta.busqueda,
        paginacionDe(consulta),
      ),
    );
  }

  /**
   * GET /api/v1/usuarios/yo — autenticado, Cliente o Vendedor (RF-USU-01,
   * RF-USU-02). Propiedad: devuelve solo al usuario del token; nunca la clave,
   * su hash ni tokens.
   */
  @Get('yo')
  async consultarYo(
    @UsuarioActual() actor: ActorAutenticado,
  ): Promise<RespuestaUsuario> {
    return aRespuestaUsuario(
      await this.consultarUsuarioActual.ejecutar(actor.id),
    );
  }

  /**
   * POST /api/v1/usuarios/yo/clave — autenticado, Cliente o Vendedor
   * (RF-USU-05). Propiedad: solo la clave del usuario del token. Conserva la
   * sesión de `tokenRenovacionActual` y revoca las demás. 5 por minuto por IP.
   */
  @Post('yo/clave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @LimiteIntentos('CAMBIO_CLAVE')
  async cambiarMiClave(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: CambioClaveDto,
  ): Promise<void> {
    await this.cambiarClave.ejecutar({
      idUsuario: actor.id,
      claveActual: cuerpo.claveActual,
      claveNueva: cuerpo.claveNueva,
      tokenRenovacionActual: cuerpo.tokenRenovacionActual,
    });
  }

  /**
   * POST /api/v1/usuarios/{id}/codigo-recuperacion — solo el Vendedor
   * (RF-USU-05, D-35). Sin cuerpo. La respuesta 201 es la única vez que el
   * código viaja por la red.
   */
  @Post(':id/codigo-recuperacion')
  @Roles('VENDEDOR')
  @HttpCode(HttpStatus.CREATED)
  async generarCodigoRecuperacion(
    @UsuarioActual() actor: ActorAutenticado,
    @Param('id', idUuid) idCliente: string,
  ): Promise<RespuestaCodigoGenerado> {
    return aRespuestaCodigoGenerado(
      await this.generarCodigo.ejecutar({ idVendedor: actor.id, idCliente }),
    );
  }
}
