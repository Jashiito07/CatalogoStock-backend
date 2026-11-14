import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BaseDatosModule } from './configuracion/base-datos.module.js';
import { LimiteIntentosModule } from './configuracion/limite-intentos.module.js';
import { ProteccionRutasModule } from './configuracion/proteccion-rutas.module.js';
import { validarVariablesEntorno } from './configuracion/variables-entorno.js';
// La consulta HTTP de la bitácora no se exporta en `auditoria/index.ts` para
// evitar un ciclo de importaciones con `usuarios` (ver ese archivo).
import { ConsultaBitacoraModule } from './modulos/auditoria/consulta-bitacora.module.js';
import { MarcasModule } from './modulos/marcas/index.js';
import { ProductosModule } from './modulos/productos/index.js';
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
    // D-17: el guard global del límite de intentos va antes que los de
    // autenticación y roles (1.4) para frenar los intentos sin verificar
    // credenciales. No cambie el orden de estos dos módulos.
    LimiteIntentosModule,
    ProteccionRutasModule,
    SaludModule,
    UsuariosModule,
    ConsultaBitacoraModule,
    MarcasModule,
    ProductosModule,
  ],
})
export class AppModule {}
