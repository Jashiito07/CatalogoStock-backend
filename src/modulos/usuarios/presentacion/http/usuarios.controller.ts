import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { LimiteIntentos } from '../../../../compartido/presentacion/limite-intentos.js';
import { RegistrarClienteCasoUso } from '../../aplicacion/casos-uso/registrar-cliente.caso-uso.js';
import { RegistroClienteDto } from './dto/registro-cliente.dto.js';
import { aRespuestaUsuario, type RespuestaUsuario } from './respuestas.js';

/**
 * Rutas de `usuarios` (contrato de usuarios).
 * `GET /usuarios/yo` llega en la subfase 1.4.
 */
@Controller('usuarios')
export class UsuariosController {
  constructor(
    @Inject(RegistrarClienteCasoUso)
    private readonly registrarCliente: RegistrarClienteCasoUso,
  ) {}

  /**
   * POST /api/v1/usuarios/registro — público (RF-USU-01, RF-USU-02, RNF-16,
   * D-07, D-11). Siempre crea un Cliente; no inicia sesión. 3 por minuto por IP (D-17).
   */
  @Post('registro')
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
}
