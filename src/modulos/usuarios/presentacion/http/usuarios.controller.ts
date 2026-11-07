import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { LimiteIntentos } from '../../../../compartido/presentacion/limite-intentos.js';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import { ConsultarUsuarioActualCasoUso } from '../../aplicacion/casos-uso/consultar-usuario-actual.caso-uso.js';
import { RegistrarClienteCasoUso } from '../../aplicacion/casos-uso/registrar-cliente.caso-uso.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import { RegistroClienteDto } from './dto/registro-cliente.dto.js';
import { aRespuestaUsuario, type RespuestaUsuario } from './respuestas.js';
import { UsuarioActual } from './usuario-actual.js';

/** Rutas de `usuarios` (contrato de usuarios). */
@Controller('usuarios')
export class UsuariosController {
  constructor(
    @Inject(RegistrarClienteCasoUso)
    private readonly registrarCliente: RegistrarClienteCasoUso,
    @Inject(ConsultarUsuarioActualCasoUso)
    private readonly consultarUsuarioActual: ConsultarUsuarioActualCasoUso,
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
}
