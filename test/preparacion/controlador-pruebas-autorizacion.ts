import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LimiteIntentos } from '../../src/compartido/presentacion/limite-intentos.js';
import {
  type ActorAutenticado,
  Roles,
  UsuarioActual,
} from '../../src/modulos/usuarios/index.js';

export const RUTA_PRUEBAS_AUTORIZACION = '/api/v1/pruebas-autorizacion';

/**
 * Controlador **solo de pruebas e2e** (no existe en `src/` ni en la API
 * desplegada). Sirve para verificar CA-02 en la subfase 1.4: el contrato aún
 * no tiene una ruta del Vendedor fuera de `GET /auditoria`, que llega en 1.5.
 *
 * No usa `@Publico()`: queda bajo los mismos guards globales que la API.
 */
@Controller('pruebas-autorizacion')
export class ControladorPruebasAutorizacion {
  constructor(@Inject(DataSource) private readonly fuente: DataSource) {}

  /**
   * Ruta administrativa que **modifica datos** (desactiva una cuenta). Si un
   * Cliente la alcanzara, el cambio se vería en la tabla `usuarios`.
   */
  @Post('usuarios/:id/desactivar')
  @Roles('VENDEDOR')
  @HttpCode(HttpStatus.OK)
  async desactivarUsuario(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ desactivado: true }> {
    await this.fuente.query(
      'UPDATE usuarios SET activo = false, fecha_actualizacion = now() WHERE id = $1',
      [id],
    );
    return { desactivado: true };
  }

  /** Solo para Clientes: el Vendedor recibe 403. */
  @Get('solo-cliente')
  @Roles('CLIENTE')
  soloCliente(@UsuarioActual() actor: ActorAutenticado): ActorAutenticado {
    return actor;
  }

  /** Sin `@Roles`: cualquier usuario autenticado. */
  @Get('autenticada')
  autenticada(@UsuarioActual() actor: ActorAutenticado): ActorAutenticado {
    return actor;
  }

  /**
   * Ruta protegida con límite de intentos: comprueba que el límite (D-17) se
   * aplica antes de verificar el token.
   */
  @Get('limitada')
  @LimiteIntentos('INGRESO')
  limitada(): { ok: true } {
    return { ok: true };
  }
}
