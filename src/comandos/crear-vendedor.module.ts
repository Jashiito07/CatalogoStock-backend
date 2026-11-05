import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { crearOpcionesPostgres } from '../configuracion/base-datos.config.js';
import {
  validarVariablesEntorno,
  type VariablesEntorno,
} from '../configuracion/variables-entorno.js';
import { UsuariosModule } from '../modulos/usuarios/index.js';

/**
 * Contexto de NestJS (sin HTTP) para `npm run crear-vendedor` (D-07).
 *
 * A diferencia de la API, aquí la conexión con PostgreSQL se abre al iniciar
 * (sin `manualInitialization`) y con un solo reintento: si la base no
 * responde, el comando falla enseguida en lugar de quedarse esperando.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarVariablesEntorno,
    }),
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
        retryAttempts: 1,
        retryDelay: 1000,
      }),
    }),
    UsuariosModule,
  ],
})
export class CrearVendedorModule {}
