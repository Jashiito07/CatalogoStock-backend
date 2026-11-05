import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { crearOpcionesPostgres } from './base-datos.config.js';
import {
  ConexionBaseDatosServicio,
  OPCIONES_CONEXION_BASE_DATOS,
  OPCIONES_CONEXION_POR_DEFECTO,
} from './conexion-base-datos.servicio.js';
import type { VariablesEntorno } from './variables-entorno.js';

/**
 * Conexión con PostgreSQL mediante TypeORM (D-04).
 * - `autoLoadEntities`: cada módulo registra sus entidades con `forFeature`.
 * - `manualInitialization`: la conexión la abre ConexionBaseDatosServicio en
 *   segundo plano, para que la API arranque aunque PostgreSQL no responda.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configuracion: ConfigService<VariablesEntorno, true>) => ({
        ...crearOpcionesPostgres({
          BD_HOST: configuracion.get('BD_HOST', { infer: true }),
          BD_PUERTO: configuracion.get('BD_PUERTO', { infer: true }),
          BD_NOMBRE: configuracion.get('BD_NOMBRE', { infer: true }),
          BD_USUARIO: configuracion.get('BD_USUARIO', { infer: true }),
          BD_CLAVE: configuracion.get('BD_CLAVE', { infer: true }),
        }),
        autoLoadEntities: true,
        manualInitialization: true,
      }),
    }),
  ],
  providers: [
    {
      provide: OPCIONES_CONEXION_BASE_DATOS,
      useValue: OPCIONES_CONEXION_POR_DEFECTO,
    },
    ConexionBaseDatosServicio,
  ],
})
export class BaseDatosModule {}
