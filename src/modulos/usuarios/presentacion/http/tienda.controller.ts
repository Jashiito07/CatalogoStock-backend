import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  ConsultarTiendaCasoUso,
  GuardarPerfilVendedorCasoUso,
  ObtenerPerfilVendedorCasoUso,
  type VistaPerfilVendedor,
  type VistaTienda,
} from '../../aplicacion/casos-uso/perfil-vendedor.caso-uso.js';
import type { ActorAutenticado } from '../../dominio/propiedad.js';
import { PerfilVendedorDto } from './dto/perfil-vendedor.dto.js';
import { Roles } from './roles.js';
import { UsuarioActual } from './usuario-actual.js';

/** Perfil comercial del Vendedor (RF-USU-08): lo edita el panel y lo consume la app. */
@Controller()
export class TiendaController {
  constructor(
    @Inject(ObtenerPerfilVendedorCasoUso)
    private readonly obtenerPerfil: ObtenerPerfilVendedorCasoUso,
    @Inject(GuardarPerfilVendedorCasoUso)
    private readonly guardarPerfil: GuardarPerfilVendedorCasoUso,
    @Inject(ConsultarTiendaCasoUso)
    private readonly consultarTienda: ConsultarTiendaCasoUso,
  ) {}

  /** GET /api/v1/vendedor/perfil — solo el Vendedor; todos los campos `null` si no hay perfil. */
  @Get('vendedor/perfil')
  @Roles('VENDEDOR')
  obtener(@UsuarioActual() actor: ActorAutenticado): Promise<VistaPerfilVendedor> {
    return this.obtenerPerfil.ejecutar(actor.id);
  }

  /** PUT /api/v1/vendedor/perfil — solo el Vendedor; crea o reemplaza (los cuatro campos). */
  @Put('vendedor/perfil')
  @Roles('VENDEDOR')
  guardar(
    @UsuarioActual() actor: ActorAutenticado,
    @Body() cuerpo: PerfilVendedorDto,
  ): Promise<VistaPerfilVendedor> {
    return this.guardarPerfil.ejecutar(actor.id, {
      nombreComercial: cuerpo.nombreComercial,
      ciudad: cuerpo.ciudad,
      provincia: cuerpo.provincia,
      whatsapp: cuerpo.whatsapp,
    });
  }

  /**
   * GET /api/v1/tienda — Cliente o Vendedor con sesión. El número de WhatsApp
   * solo se entrega aquí, nunca en una ruta pública. 404 `TIENDA_NO_CONFIGURADA`.
   */
  @Get('tienda')
  tienda(): Promise<VistaTienda> {
    return this.consultarTienda.ejecutar();
  }
}
