import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GENERADOR_ID,
  type GeneradorId,
} from '../../compartido/aplicacion/generador-id.puerto.js';
import { RELOJ, type Reloj } from '../../compartido/aplicacion/reloj.puerto.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { GeneradorIdUuid } from '../../compartido/infraestructura/generador-id-uuid.js';
import { RelojSistema } from '../../compartido/infraestructura/reloj-sistema.js';
import { UnidadDeTrabajoTypeorm } from '../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import {
  AuditoriaModule,
  SERVICIO_AUDITORIA,
  type ServicioAuditoria,
} from '../auditoria/index.js';
import { ActualizarMarcaCasoUso } from './aplicacion/casos-uso/actualizar-marca.caso-uso.js';
import { CrearMarcaCasoUso } from './aplicacion/casos-uso/crear-marca.caso-uso.js';
import { ListarMarcasSugeridasCasoUso } from './aplicacion/casos-uso/listar-marcas-sugeridas.caso-uso.js';
import { ListarMarcasCasoUso } from './aplicacion/casos-uso/listar-marcas.caso-uso.js';
import { MarcasServicio } from './aplicacion/marcas.servicio.js';
import {
  MARCA_REPOSITORIO,
  type MarcaRepositorio,
} from './aplicacion/puertos/marca.repositorio.js';
import { MarcaOrmEntity } from './infraestructura/persistencia/marca.orm-entity.js';
import { MarcaRepositorioTypeorm } from './infraestructura/persistencia/marca.repositorio.typeorm.js';
import { MarcasController } from './presentacion/http/marcas.controller.js';

/**
 * Módulo de marcas (RF-PRO-04, RF-PRO-06, RF-CAT-05, D-43, D-48; subfase 2.2).
 * Exporta `MarcasServicio` para `productos` (2.3): ningún otro módulo accede a
 * la tabla `marcas`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MarcaOrmEntity]), AuditoriaModule],
  controllers: [MarcasController],
  providers: [
    { provide: MARCA_REPOSITORIO, useClass: MarcaRepositorioTypeorm },
    { provide: GENERADOR_ID, useClass: GeneradorIdUuid },
    { provide: RELOJ, useClass: RelojSistema },
    { provide: UNIDAD_DE_TRABAJO, useClass: UnidadDeTrabajoTypeorm },
    {
      provide: ListarMarcasCasoUso,
      inject: [MARCA_REPOSITORIO],
      useFactory: (marcas: MarcaRepositorio) => new ListarMarcasCasoUso(marcas),
    },
    {
      provide: ListarMarcasSugeridasCasoUso,
      inject: [MARCA_REPOSITORIO],
      useFactory: (marcas: MarcaRepositorio) =>
        new ListarMarcasSugeridasCasoUso(marcas),
    },
    {
      provide: CrearMarcaCasoUso,
      inject: [
        MARCA_REPOSITORIO,
        GENERADOR_ID,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        marcas: MarcaRepositorio,
        generadorId: GeneradorId,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new CrearMarcaCasoUso(
          marcas,
          generadorId,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: ActualizarMarcaCasoUso,
      inject: [MARCA_REPOSITORIO, RELOJ, UNIDAD_DE_TRABAJO, SERVICIO_AUDITORIA],
      useFactory: (
        marcas: MarcaRepositorio,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) => new ActualizarMarcaCasoUso(marcas, reloj, unidadTrabajo, auditoria),
    },
    {
      provide: MarcasServicio,
      inject: [MARCA_REPOSITORIO],
      useFactory: (marcas: MarcaRepositorio) => new MarcasServicio(marcas),
    },
  ],
  exports: [MarcasServicio],
})
export class MarcasModule {}
