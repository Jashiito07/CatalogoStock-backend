import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { LimiteIntentos } from '../../../../compartido/presentacion/limite-intentos.js';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import { CerrarSesionCasoUso } from '../../aplicacion/casos-uso/cerrar-sesion.caso-uso.js';
import { IniciarSesionCasoUso } from '../../aplicacion/casos-uso/iniciar-sesion.caso-uso.js';
import { RecuperarClaveCasoUso } from '../../aplicacion/casos-uso/recuperar-clave.caso-uso.js';
import { RenovarSesionCasoUso } from '../../aplicacion/casos-uso/renovar-sesion.caso-uso.js';
import type { Canal } from '../../dominio/canal.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import { IngresoDto, TokenRenovacionDto } from './dto/autenticacion.dto.js';
import { RecuperacionClaveDto } from './dto/clave.dto.js';
import { aRespuestaSesion, type RespuestaSesion } from './respuestas.js';
import { UsuarioActual } from './usuario-actual.js';

/**
 * Sesión: ingreso por canal, renovación y salida (RF-USU-01, CA-01, D-09, D-19).
 * Las rutas de ingreso comparten el límite de 5 intentos por minuto y por IP (D-17).
 */
@Controller('autenticacion')
export class AutenticacionController {
  constructor(
    @Inject(IniciarSesionCasoUso)
    private readonly iniciarSesion: IniciarSesionCasoUso,
    @Inject(RenovarSesionCasoUso)
    private readonly renovarSesion: RenovarSesionCasoUso,
    @Inject(CerrarSesionCasoUso)
    private readonly cerrarSesion: CerrarSesionCasoUso,
    @Inject(RecuperarClaveCasoUso)
    private readonly recuperarClave: RecuperarClaveCasoUso,
  ) {}

  /** POST /api/v1/autenticacion/ingreso/cliente — público; app móvil, solo Clientes (D-19). */
  @Post('ingreso/cliente')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @LimiteIntentos('INGRESO')
  ingresarCliente(@Body() cuerpo: IngresoDto): Promise<RespuestaSesion> {
    return this.ingresar('APP', cuerpo);
  }

  /** POST /api/v1/autenticacion/ingreso/vendedor — público; panel web, solo el Vendedor (D-19). */
  @Post('ingreso/vendedor')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @LimiteIntentos('INGRESO')
  ingresarVendedor(@Body() cuerpo: IngresoDto): Promise<RespuestaSesion> {
    return this.ingresar('PANEL', cuerpo);
  }

  /** POST /api/v1/autenticacion/renovacion — público, con el token de renovación (D-09). */
  @Post('renovacion')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @LimiteIntentos('RENOVACION')
  async renovar(@Body() cuerpo: TokenRenovacionDto): Promise<RespuestaSesion> {
    return aRespuestaSesion(
      await this.renovarSesion.ejecutar(cuerpo.tokenRenovacion),
    );
  }

  /**
   * POST /api/v1/autenticacion/recuperacion — público (RF-USU-05, D-35). El
   * Cliente cambia su clave olvidada con el código del Vendedor → 204. Ante
   * cualquier fallo, el mismo 422 `CODIGO_INVALIDO`. 5 por minuto por IP (D-17).
   */
  @Post('recuperacion')
  @Publico()
  @HttpCode(HttpStatus.NO_CONTENT)
  @LimiteIntentos('RECUPERACION')
  async recuperar(@Body() cuerpo: RecuperacionClaveDto): Promise<void> {
    await this.recuperarClave.ejecutar({
      correo: cuerpo.correo,
      codigo: cuerpo.codigo,
      claveNueva: cuerpo.claveNueva,
    });
  }

  /**
   * POST /api/v1/autenticacion/salida — autenticado (Cliente o Vendedor) por el
   * guard global (no es `@Publico()`). Revoca la familia del token indicado;
   * idempotente → 204 sin cuerpo.
   */
  @Post('salida')
  @HttpCode(HttpStatus.NO_CONTENT)
  async salir(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: TokenRenovacionDto,
  ): Promise<void> {
    await this.cerrarSesion.ejecutar({
      idUsuario: actor.id,
      tokenRenovacion: cuerpo.tokenRenovacion,
    });
  }

  private async ingresar(
    canal: Canal,
    cuerpo: IngresoDto,
  ): Promise<RespuestaSesion> {
    return aRespuestaSesion(
      await this.iniciarSesion.ejecutar({
        canal,
        correo: cuerpo.correo,
        clave: cuerpo.clave,
      }),
    );
  }
}
