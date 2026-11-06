import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BaseDatosModule } from './configuracion/base-datos.module.js';
import { LimiteIntentosModule } from './configuracion/limite-intentos.module.js';
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
    // D-17: el guard global del límite de intentos va antes que el de
    // autenticación (1.4) para frenar los intentos sin verificar credenciales.
    LimiteIntentosModule,
    SaludModule,
    UsuariosModule,
  ],
})
export class AppModule {}
