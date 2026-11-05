import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BaseDatosModule } from './configuracion/base-datos.module.js';
import { validarVariablesEntorno } from './configuracion/variables-entorno.js';
import { SaludModule } from './modulos/salud/index.js';
import { UsuariosModule } from './modulos/usuarios/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarVariablesEntorno,
    }),
    BaseDatosModule,
    SaludModule,
    UsuariosModule,
  ],
})
export class AppModule {}
