import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { VariablesEntorno } from '../../configuracion/variables-entorno.js';
import {
  AuditoriaModule,
  SERVICIO_AUDITORIA,
  type ServicioAuditoria,
} from '../auditoria/index.js';
import { MarcasModule, MarcasServicio } from '../marcas/index.js';
import { ProductosModule, ProductosServicio } from '../productos/index.js';
import { CalculadorTotalesImportacion } from './aplicacion/calculador-totales.js';
import { AprobarBorradoresCasoUso } from './aplicacion/casos-uso/aprobar-borradores.caso-uso.js';
import { CrearImportacionCasoUso } from './aplicacion/casos-uso/crear-importacion.caso-uso.js';
import { DescartarBorradoresCasoUso } from './aplicacion/casos-uso/descartar-borradores.caso-uso.js';
import { EditarBorradorCasoUso } from './aplicacion/casos-uso/editar-borrador.caso-uso.js';
import { EliminarImportacionCasoUso } from './aplicacion/casos-uso/eliminar-importacion.caso-uso.js';
import { EliminarImportacionesVencidasCasoUso } from './aplicacion/casos-uso/eliminar-importaciones-vencidas.caso-uso.js';
import { ListarAusentesCasoUso } from './aplicacion/casos-uso/listar-ausentes.caso-uso.js';
import { ListarBorradoresCasoUso } from './aplicacion/casos-uso/listar-borradores.caso-uso.js';
import { ListarImportacionesCasoUso } from './aplicacion/casos-uso/listar-importaciones.caso-uso.js';
import { ObtenerImportacionCasoUso } from './aplicacion/casos-uso/obtener-importacion.caso-uso.js';
import {
  BORRADOR_REPOSITORIO,
  type BorradorRepositorio,
} from './aplicacion/puertos/borrador.repositorio.js';
import {
  CALCULADOR_HUELLA,
  type CalculadorHuella,
} from './aplicacion/puertos/calculador-huella.puerto.js';
import {
  CREADOR_PRODUCTOS,
  type CreadorProductos,
} from './aplicacion/puertos/creador-productos.puerto.js';
import {
  DIRECTORIO_MARCAS,
  type DirectorioMarcas,
} from './aplicacion/puertos/directorio-marcas.puerto.js';
import {
  IMPORTACION_REPOSITORIO,
  type ImportacionRepositorio,
} from './aplicacion/puertos/importacion.repositorio.js';
import {
  LECTOR_PDF,
  type LectorPdf,
} from './aplicacion/puertos/lector-pdf.puerto.js';
import {
  PRODUCTOS_EXISTENTES,
  type ProductosExistentes,
} from './aplicacion/puertos/productos-existentes.puerto.js';
import { CalculadorHuellaSha256 } from './infraestructura/archivo/calculador-huella.sha256.js';
import { DirectorioMarcasModuloMarcas } from './infraestructura/marcas/directorio-marcas.modulo-marcas.js';
import { LectorPdfPdfjs } from './infraestructura/pdf/lector-pdf.pdfjs.js';
import { BorradorOrmEntity } from './infraestructura/persistencia/borrador.orm-entity.js';
import { BorradorRepositorioTypeorm } from './infraestructura/persistencia/borrador.repositorio.typeorm.js';
import { ImportacionOrmEntity } from './infraestructura/persistencia/importacion.orm-entity.js';
import { ImportacionRepositorioTypeorm } from './infraestructura/persistencia/importacion.repositorio.typeorm.js';
import { PlanificadorRetencionImportaciones } from './infraestructura/planificador/planificador-retencion.js';
import { CreadorProductosModuloProductos } from './infraestructura/productos/creador-productos.modulo-productos.js';
import { ProductosExistentesModuloProductos } from './infraestructura/productos/productos-existentes.modulo-productos.js';
import { ImportacionesController } from './presentacion/http/importaciones.controller.js';

/**
 * Módulo de importación asistida del catálogo en PDF (RF-PRO-01, RF-PRO-02,
 * D-49, D-55, D-57; subfase 2.8 y catálogos mensuales). Usa `MarcasServicio` y
 * `ProductosServicio` (nunca sus tablas). Los borradores viven en sus propias
 * tablas y solo se convierten en productos (o actualizan su precio) al
 * aprobarlos. La retención automática de las importaciones archivadas la
 * ejecuta un planificador interno del servidor, sin dependencias nuevas.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ImportacionOrmEntity, BorradorOrmEntity]),
    AuditoriaModule,
    MarcasModule,
    ProductosModule,
  ],
  controllers: [ImportacionesController],
  providers: [
    { provide: IMPORTACION_REPOSITORIO, useClass: ImportacionRepositorioTypeorm },
    { provide: BORRADOR_REPOSITORIO, useClass: BorradorRepositorioTypeorm },
    { provide: LECTOR_PDF, useFactory: () => new LectorPdfPdfjs() },
    { provide: CALCULADOR_HUELLA, useClass: CalculadorHuellaSha256 },
    { provide: GENERADOR_ID, useClass: GeneradorIdUuid },
    { provide: RELOJ, useClass: RelojSistema },
    { provide: UNIDAD_DE_TRABAJO, useClass: UnidadDeTrabajoTypeorm },
    {
      provide: DIRECTORIO_MARCAS,
      inject: [MarcasServicio],
      useFactory: (marcas: MarcasServicio) =>
        new DirectorioMarcasModuloMarcas(marcas),
    },
    {
      provide: CREADOR_PRODUCTOS,
      inject: [ProductosServicio],
      useFactory: (productos: ProductosServicio) =>
        new CreadorProductosModuloProductos(productos),
    },
    {
      provide: PRODUCTOS_EXISTENTES,
      inject: [ProductosServicio],
      useFactory: (productos: ProductosServicio) =>
        new ProductosExistentesModuloProductos(productos),
    },
    {
      provide: CalculadorTotalesImportacion,
      inject: [BORRADOR_REPOSITORIO, PRODUCTOS_EXISTENTES],
      useFactory: (
        borradores: BorradorRepositorio,
        productos: ProductosExistentes,
      ) => new CalculadorTotalesImportacion(borradores, productos),
    },
    {
      provide: CrearImportacionCasoUso,
      inject: [
        IMPORTACION_REPOSITORIO,
        BORRADOR_REPOSITORIO,
        DIRECTORIO_MARCAS,
        LECTOR_PDF,
        CALCULADOR_HUELLA,
        GENERADOR_ID,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
        CalculadorTotalesImportacion,
      ],
      useFactory: (
        importaciones: ImportacionRepositorio,
        borradores: BorradorRepositorio,
        marcas: DirectorioMarcas,
        lector: LectorPdf,
        huellas: CalculadorHuella,
        generadorId: GeneradorId,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
        totales: CalculadorTotalesImportacion,
      ) =>
        new CrearImportacionCasoUso(
          importaciones,
          borradores,
          marcas,
          lector,
          huellas,
          generadorId,
          reloj,
          unidadTrabajo,
          auditoria,
          totales,
        ),
    },
    {
      provide: ObtenerImportacionCasoUso,
      inject: [
        IMPORTACION_REPOSITORIO,
        CalculadorTotalesImportacion,
        DIRECTORIO_MARCAS,
      ],
      useFactory: (
        importaciones: ImportacionRepositorio,
        totales: CalculadorTotalesImportacion,
        marcas: DirectorioMarcas,
      ) => new ObtenerImportacionCasoUso(importaciones, totales, marcas),
    },
    {
      provide: ListarImportacionesCasoUso,
      inject: [
        IMPORTACION_REPOSITORIO,
        CalculadorTotalesImportacion,
        DIRECTORIO_MARCAS,
      ],
      useFactory: (
        importaciones: ImportacionRepositorio,
        totales: CalculadorTotalesImportacion,
        marcas: DirectorioMarcas,
      ) => new ListarImportacionesCasoUso(importaciones, totales, marcas),
    },
    {
      provide: ListarAusentesCasoUso,
      inject: [
        IMPORTACION_REPOSITORIO,
        BORRADOR_REPOSITORIO,
        PRODUCTOS_EXISTENTES,
      ],
      useFactory: (
        importaciones: ImportacionRepositorio,
        borradores: BorradorRepositorio,
        productos: ProductosExistentes,
      ) => new ListarAusentesCasoUso(importaciones, borradores, productos),
    },
    {
      provide: ListarBorradoresCasoUso,
      inject: [
        IMPORTACION_REPOSITORIO,
        BORRADOR_REPOSITORIO,
        PRODUCTOS_EXISTENTES,
      ],
      useFactory: (
        importaciones: ImportacionRepositorio,
        borradores: BorradorRepositorio,
        productos: ProductosExistentes,
      ) => new ListarBorradoresCasoUso(importaciones, borradores, productos),
    },
    {
      provide: EditarBorradorCasoUso,
      inject: [
        BORRADOR_REPOSITORIO,
        DIRECTORIO_MARCAS,
        PRODUCTOS_EXISTENTES,
        RELOJ,
        UNIDAD_DE_TRABAJO,
      ],
      useFactory: (
        borradores: BorradorRepositorio,
        marcas: DirectorioMarcas,
        productos: ProductosExistentes,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
      ) =>
        new EditarBorradorCasoUso(
          borradores,
          marcas,
          productos,
          reloj,
          unidadTrabajo,
        ),
    },
    {
      provide: AprobarBorradoresCasoUso,
      inject: [
        BORRADOR_REPOSITORIO,
        CREADOR_PRODUCTOS,
        PRODUCTOS_EXISTENTES,
        DIRECTORIO_MARCAS,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        borradores: BorradorRepositorio,
        creador: CreadorProductos,
        existentes: ProductosExistentes,
        marcas: DirectorioMarcas,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new AprobarBorradoresCasoUso(
          borradores,
          creador,
          existentes,
          marcas,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: DescartarBorradoresCasoUso,
      inject: [BORRADOR_REPOSITORIO, RELOJ, UNIDAD_DE_TRABAJO, SERVICIO_AUDITORIA],
      useFactory: (
        borradores: BorradorRepositorio,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new DescartarBorradoresCasoUso(
          borradores,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: EliminarImportacionCasoUso,
      inject: [
        IMPORTACION_REPOSITORIO,
        BORRADOR_REPOSITORIO,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        importaciones: ImportacionRepositorio,
        borradores: BorradorRepositorio,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new EliminarImportacionCasoUso(
          importaciones,
          borradores,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: EliminarImportacionesVencidasCasoUso,
      inject: [
        IMPORTACION_REPOSITORIO,
        BORRADOR_REPOSITORIO,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        importaciones: ImportacionRepositorio,
        borradores: BorradorRepositorio,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new EliminarImportacionesVencidasCasoUso(
          importaciones,
          borradores,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      // D-57: revisa al arrancar y cada 24 h; RETENCION_IMPORTACIONES_ACTIVA=false lo apaga.
      provide: PlanificadorRetencionImportaciones,
      inject: [EliminarImportacionesVencidasCasoUso, ConfigService],
      useFactory: (
        retencion: EliminarImportacionesVencidasCasoUso,
        configuracion: ConfigService<VariablesEntorno, true>,
      ) =>
        new PlanificadorRetencionImportaciones(
          retencion,
          configuracion.get('RETENCION_IMPORTACIONES_ACTIVA', { infer: true }),
        ),
    },
  ],
})
export class ImportacionModule {}
