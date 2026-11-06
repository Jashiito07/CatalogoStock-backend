import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { describirError } from '../configuracion/conexion-base-datos.servicio.js';
import { CrearVendedorCasoUso } from '../modulos/usuarios/index.js';
import { ejecutarComandoCrearVendedor } from '../modulos/usuarios/presentacion/cli/crear-vendedor.comando.js';
import { CrearVendedorModule } from './crear-vendedor.module.js';

/**
 * Punto de entrada de `npm run crear-vendedor` (D-07, PA-09).
 *
 * Lee VENDEDOR_NOMBRE, VENDEDOR_CORREO, VENDEDOR_TELEFONO y VENDEDOR_CLAVE del
 * entorno o de `.env` (las variables de la sesión tienen prioridad) y crea el
 * Vendedor solo si todavía no existe ninguno. Nunca escribe la clave ni su hash.
 */
async function principal(): Promise<number> {
  const logger = new Logger('CrearVendedor');
  let contexto;
  try {
    contexto = await NestFactory.createApplicationContext(CrearVendedorModule, {
      logger: ['error', 'warn'],
    });
  } catch (error) {
    logger.error(
      `No se pudo iniciar el comando (${describirError(error)}). Revise .env y que PostgreSQL esté disponible.`,
    );
    return 1;
  }

  try {
    const configuracion = contexto.get(ConfigService);
    return await ejecutarComandoCrearVendedor(
      contexto.get(CrearVendedorCasoUso),
      (nombre) => configuracion.get<string>(nombre),
      {
        // `log` está desactivado en el contexto; el resultado se muestra siempre.
        informar: (mensaje) => process.stdout.write(`${mensaje}\n`),
        error: (mensaje) => logger.error(mensaje),
      },
    );
  } finally {
    await contexto.close();
  }
}

process.exitCode = await principal();
