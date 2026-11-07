import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GENERADOR_ID,
  type GeneradorId,
} from '../../compartido/aplicacion/generador-id.puerto.js';
import { RELOJ, type Reloj } from '../../compartido/aplicacion/reloj.puerto.js';
import { GeneradorIdUuid } from '../../compartido/infraestructura/generador-id-uuid.js';
import { RelojSistema } from '../../compartido/infraestructura/reloj-sistema.js';
import { RegistrarActividadCasoUso } from './aplicacion/casos-uso/registrar-actividad.caso-uso.js';
import {
  REGISTRO_ACTIVIDAD_REPOSITORIO,
  type RegistroActividadRepositorio,
} from './aplicacion/puertos/registro-actividad.repositorio.js';
import {
  REGISTRO_TECNICO_AUDITORIA,
  type RegistroTecnico,
} from './aplicacion/puertos/registro-tecnico.puerto.js';
import { SERVICIO_AUDITORIA } from './aplicacion/servicio-auditoria.js';
import { RegistroActividadOrmEntity } from './infraestructura/persistencia/registro-actividad.orm-entity.js';
import { RegistroActividadRepositorioTypeorm } from './infraestructura/persistencia/registro-actividad.repositorio.typeorm.js';
import { RegistroTecnicoNest } from './infraestructura/registro-tecnico.nest.js';

/**
 * Bitácora de actividades (RF-USU-04, subfase 1.5): tabla `auditoria` y el
 * servicio público `SERVICIO_AUDITORIA` que usan los demás módulos.
 *
 * No depende de ningún otro módulo de negocio, para que cualquiera pueda
 * importarlo (también el comando `crear-vendedor`, sin HTTP). La consulta
 * HTTP está en `ConsultaBitacoraModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RegistroActividadOrmEntity])],
  providers: [
    {
      provide: REGISTRO_ACTIVIDAD_REPOSITORIO,
      useClass: RegistroActividadRepositorioTypeorm,
    },
    { provide: REGISTRO_TECNICO_AUDITORIA, useClass: RegistroTecnicoNest },
    { provide: GENERADOR_ID, useClass: GeneradorIdUuid },
    { provide: RELOJ, useClass: RelojSistema },
    {
      provide: SERVICIO_AUDITORIA,
      inject: [
        REGISTRO_ACTIVIDAD_REPOSITORIO,
        GENERADOR_ID,
        RELOJ,
        REGISTRO_TECNICO_AUDITORIA,
      ],
      useFactory: (
        registros: RegistroActividadRepositorio,
        generadorId: GeneradorId,
        reloj: Reloj,
        registroTecnico: RegistroTecnico,
      ) =>
        new RegistrarActividadCasoUso(
          registros,
          generadorId,
          reloj,
          registroTecnico,
        ),
    },
  ],
  // El repositorio se exporta solo para `ConsultaBitacoraModule` (mismo módulo
  // de negocio); `index.ts` no lo publica.
  exports: [SERVICIO_AUDITORIA, REGISTRO_ACTIVIDAD_REPOSITORIO],
})
export class AuditoriaModule {}
