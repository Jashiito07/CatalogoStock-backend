import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarAplicacionHttp } from './configuracion/aplicacion-http.js';
import {
  obtenerOrigenesCors,
  type VariablesEntorno,
} from './configuracion/variables-entorno.js';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configuracion =
    app.get<ConfigService<VariablesEntorno, true>>(ConfigService);

  configurarAplicacionHttp(
    app,
    obtenerOrigenesCors(configuracion.get('CORS_ORIGENES', { infer: true })),
  );
  // Cierra la conexión con PostgreSQL al detener el proceso.
  app.enableShutdownHooks();

  const puerto = configuracion.get('PUERTO', { infer: true });
  await app.listen(puerto);
  new Logger('Arranque').log(`API escuchando en el puerto ${puerto}.`);
}

await iniciar();
