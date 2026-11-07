import { Module } from '@nestjs/common';
import {
  ConsultarResumenesUsuariosCasoUso,
  UsuariosModule,
} from '../usuarios/index.js';
import { AuditoriaModule } from './auditoria.module.js';
import { ConsultarBitacoraCasoUso } from './aplicacion/casos-uso/consultar-bitacora.caso-uso.js';
import {
  DIRECTORIO_USUARIOS,
  type DirectorioUsuarios,
} from './aplicacion/puertos/directorio-usuarios.puerto.js';
import {
  REGISTRO_ACTIVIDAD_REPOSITORIO,
  type RegistroActividadRepositorio,
} from './aplicacion/puertos/registro-actividad.repositorio.js';
import { DirectorioUsuariosModuloUsuarios } from './infraestructura/usuarios/directorio-usuarios.modulo-usuarios.js';
import { AuditoriaController } from './presentacion/http/auditoria.controller.js';

/**
 * Consulta de la bitácora por HTTP: `GET /api/v1/auditoria` (RF-USU-04,
 * subfase 1.5). Separada de `AuditoriaModule` porque necesita el servicio
 * público de `usuarios` (nombre y rol al consultar), mientras que `usuarios`
 * necesita `AuditoriaModule` para registrar: así no hay dependencia circular.
 */
@Module({
  imports: [AuditoriaModule, UsuariosModule],
  controllers: [AuditoriaController],
  providers: [
    {
      provide: DIRECTORIO_USUARIOS,
      inject: [ConsultarResumenesUsuariosCasoUso],
      useFactory: (resumenes: ConsultarResumenesUsuariosCasoUso) =>
        new DirectorioUsuariosModuloUsuarios(resumenes),
    },
    {
      provide: ConsultarBitacoraCasoUso,
      inject: [REGISTRO_ACTIVIDAD_REPOSITORIO, DIRECTORIO_USUARIOS],
      useFactory: (
        registros: RegistroActividadRepositorio,
        directorio: DirectorioUsuarios,
      ) => new ConsultarBitacoraCasoUso(registros, directorio),
    },
  ],
})
export class ConsultaBitacoraModule {}
