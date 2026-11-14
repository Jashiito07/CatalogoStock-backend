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
import { type VariablesEntorno } from '../../configuracion/variables-entorno.js';
import { GeneradorIdUuid } from '../../compartido/infraestructura/generador-id-uuid.js';
import { RelojSistema } from '../../compartido/infraestructura/reloj-sistema.js';
import { UnidadDeTrabajoTypeorm } from '../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import {
  AuditoriaModule,
  SERVICIO_AUDITORIA,
  type ServicioAuditoria,
} from '../auditoria/index.js';
import { MarcasModule, MarcasServicio } from '../marcas/index.js';
import { ActualizarProductoCasoUso } from './aplicacion/casos-uso/actualizar-producto.caso-uso.js';
import { AgregarImagenCasoUso } from './aplicacion/casos-uso/agregar-imagen.caso-uso.js';
import { ConsultarImagenesCasoUso } from './aplicacion/casos-uso/consultar-imagenes.caso-uso.js';
import { EliminarImagenCasoUso } from './aplicacion/casos-uso/eliminar-imagen.caso-uso.js';
import { ObtenerArchivoImagenCasoUso } from './aplicacion/casos-uso/obtener-archivo-imagen.caso-uso.js';
import { ReordenarImagenesCasoUso } from './aplicacion/casos-uso/reordenar-imagenes.caso-uso.js';
import { CrearProductoCasoUso } from './aplicacion/casos-uso/crear-producto.caso-uso.js';
import { EliminarProductoCasoUso } from './aplicacion/casos-uso/eliminar-producto.caso-uso.js';
import { ListarProductosCasoUso } from './aplicacion/casos-uso/listar-productos.caso-uso.js';
import { ObtenerProductoCasoUso } from './aplicacion/casos-uso/obtener-producto.caso-uso.js';
import { ProductosServicio } from './aplicacion/productos.servicio.js';
import {
  ALMACEN_IMAGENES,
  type AlmacenImagenes,
} from './aplicacion/puertos/almacen-imagenes.puerto.js';
import {
  IMAGEN_REPOSITORIO,
  type ImagenRepositorio,
} from './aplicacion/puertos/imagen.repositorio.js';
import {
  DIRECTORIO_MARCAS,
  type DirectorioMarcas,
} from './aplicacion/puertos/directorio-marcas.puerto.js';
import {
  PRODUCTO_REPOSITORIO,
  type ProductoRepositorio,
} from './aplicacion/puertos/producto.repositorio.js';
import { DirectorioMarcasModuloMarcas } from './infraestructura/marcas/directorio-marcas.modulo-marcas.js';
import { AlmacenImagenesDisco } from './infraestructura/almacenamiento/almacen-imagenes.disco.js';
import { ImagenOrmEntity } from './infraestructura/persistencia/imagen.orm-entity.js';
import { ImagenRepositorioTypeorm } from './infraestructura/persistencia/imagen.repositorio.typeorm.js';
import { ProductoOrmEntity } from './infraestructura/persistencia/producto.orm-entity.js';
import { ProductoRepositorioTypeorm } from './infraestructura/persistencia/producto.repositorio.typeorm.js';
import { ImagenesController } from './presentacion/http/imagenes.controller.js';
import { ProductosController } from './presentacion/http/productos.controller.js';

/**
 * Módulo de productos (RF-PRO-01 a RF-PRO-05, RF-INV-03, RF-CAT-03, PA-07;
 * subfase 2.3). Usa `MarcasServicio` (nunca la tabla `marcas`) y exporta
 * `ProductosServicio` para las imágenes (2.4) y los módulos posteriores.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProductoOrmEntity, ImagenOrmEntity]),
    AuditoriaModule,
    MarcasModule,
  ],
  controllers: [ProductosController, ImagenesController],
  providers: [
    { provide: PRODUCTO_REPOSITORIO, useClass: ProductoRepositorioTypeorm },
    { provide: IMAGEN_REPOSITORIO, useClass: ImagenRepositorioTypeorm },
    {
      // D-46: carpeta del servidor fuera de Git (RUTA_ALMACENAMIENTO).
      provide: ALMACEN_IMAGENES,
      inject: [ConfigService],
      useFactory: (configuracion: ConfigService<VariablesEntorno, true>) =>
        new AlmacenImagenesDisco(
          configuracion.get('RUTA_ALMACENAMIENTO', { infer: true }),
        ),
    },
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
      provide: ListarProductosCasoUso,
      inject: [PRODUCTO_REPOSITORIO, DIRECTORIO_MARCAS],
      useFactory: (productos: ProductoRepositorio, marcas: DirectorioMarcas) =>
        new ListarProductosCasoUso(productos, marcas),
    },
    {
      provide: ObtenerProductoCasoUso,
      inject: [PRODUCTO_REPOSITORIO, DIRECTORIO_MARCAS],
      useFactory: (productos: ProductoRepositorio, marcas: DirectorioMarcas) =>
        new ObtenerProductoCasoUso(productos, marcas),
    },
    {
      provide: CrearProductoCasoUso,
      inject: [
        PRODUCTO_REPOSITORIO,
        DIRECTORIO_MARCAS,
        GENERADOR_ID,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        productos: ProductoRepositorio,
        marcas: DirectorioMarcas,
        generadorId: GeneradorId,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new CrearProductoCasoUso(
          productos,
          marcas,
          generadorId,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: ActualizarProductoCasoUso,
      inject: [
        PRODUCTO_REPOSITORIO,
        DIRECTORIO_MARCAS,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        productos: ProductoRepositorio,
        marcas: DirectorioMarcas,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new ActualizarProductoCasoUso(
          productos,
          marcas,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: EliminarProductoCasoUso,
      inject: [
        PRODUCTO_REPOSITORIO,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        productos: ProductoRepositorio,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new EliminarProductoCasoUso(productos, reloj, unidadTrabajo, auditoria),
    },
    {
      provide: ConsultarImagenesCasoUso,
      inject: [IMAGEN_REPOSITORIO],
      useFactory: (imagenes: ImagenRepositorio) =>
        new ConsultarImagenesCasoUso(imagenes),
    },
    {
      provide: AgregarImagenCasoUso,
      inject: [
        PRODUCTO_REPOSITORIO,
        IMAGEN_REPOSITORIO,
        ALMACEN_IMAGENES,
        GENERADOR_ID,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        productos: ProductoRepositorio,
        imagenes: ImagenRepositorio,
        almacen: AlmacenImagenes,
        generadorId: GeneradorId,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new AgregarImagenCasoUso(
          productos,
          imagenes,
          almacen,
          generadorId,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: ReordenarImagenesCasoUso,
      inject: [PRODUCTO_REPOSITORIO, IMAGEN_REPOSITORIO, UNIDAD_DE_TRABAJO],
      useFactory: (
        productos: ProductoRepositorio,
        imagenes: ImagenRepositorio,
        unidadTrabajo: UnidadDeTrabajo,
      ) => new ReordenarImagenesCasoUso(productos, imagenes, unidadTrabajo),
    },
    {
      provide: EliminarImagenCasoUso,
      inject: [
        PRODUCTO_REPOSITORIO,
        IMAGEN_REPOSITORIO,
        ALMACEN_IMAGENES,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        productos: ProductoRepositorio,
        imagenes: ImagenRepositorio,
        almacen: AlmacenImagenes,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new EliminarImagenCasoUso(
          productos,
          imagenes,
          almacen,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: ObtenerArchivoImagenCasoUso,
      inject: [ALMACEN_IMAGENES],
      useFactory: (almacen: AlmacenImagenes) =>
        new ObtenerArchivoImagenCasoUso(almacen),
    },
    {
      provide: ProductosServicio,
      inject: [PRODUCTO_REPOSITORIO],
      useFactory: (productos: ProductoRepositorio) =>
        new ProductosServicio(productos),
    },
  ],
  exports: [ProductosServicio],
})
export class ProductosModule {}
