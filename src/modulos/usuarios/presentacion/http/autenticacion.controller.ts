import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LimiteIntentos } from '../../../../compartido/presentacion/limite-intentos.js';
import { CerrarSesionCasoUso } from '../../aplicacion/casos-uso/cerrar-sesion.caso-uso.js';
import { IniciarSesionCasoUso } from '../../aplicacion/casos-uso/iniciar-sesion.caso-uso.js';
import { RenovarSesionCasoUso } from '../../aplicacion/casos-uso/renovar-sesion.caso-uso.js';
import type { IdentidadTokenAcceso } from '../../aplicacion/puertos/emisor-token-acceso.puerto.js';
import type { Canal } from '../../dominio/canal.js';
import { IngresoDto, TokenRenovacionDto } from './dto/autenticacion.dto.js';
import { GuardTokenAcceso, UsuarioAutenticado } from './guard-token-acceso.js';
import { aRespuestaSesion, type RespuestaSesion } from './respuestas.js';

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
  ) {}

  /** POST /api/v1/autenticacion/ingreso/cliente — app móvil, solo Clientes (D-19). */
  @Post('ingreso/cliente')
  @HttpCode(HttpStatus.OK)
  @LimiteIntentos('INGRESO')
  ingresarCliente(@Body() cuerpo: IngresoDto): Promise<RespuestaSesion> {
    return this.ingresar('APP', cuerpo);
  }

  /** POST /api/v1/autenticacion/ingreso/vendedor — panel web, solo el Vendedor (D-19). */
  @Post('ingreso/vendedor')
  @HttpCode(HttpStatus.OK)
  @LimiteIntentos('INGRESO')
  ingresarVendedor(@Body() cuerpo: IngresoDto): Promise<RespuestaSesion> {
    return this.ingresar('PANEL', cuerpo);
  }

  /** POST /api/v1/autenticacion/renovacion — público, con el token de renovación (D-09). */
  @Post('renovacion')
  @HttpCode(HttpStatus.OK)
  @LimiteIntentos('RENOVACION')
  async renovar(@Body() cuerpo: TokenRenovacionDto): Promise<RespuestaSesion> {
    return aRespuestaSesion(
      await this.renovarSesion.ejecutar(cuerpo.tokenRenovacion),
    );
  }

  /**
   * POST /api/v1/autenticacion/salida — autenticado (Cliente o Vendedor).
   * Revoca la familia del token indicado; idempotente → 204 sin cuerpo.
   */
  @Post('salida')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(GuardTokenAcceso)
  async salir(
    @UsuarioAutenticado() identidad: IdentidadTokenAcceso,
    @Body() cuerpo: TokenRenovacionDto,
  ): Promise<void> {
    await this.cerrarSesion.ejecutar({
      idUsuario: identidad.idUsuario,
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
