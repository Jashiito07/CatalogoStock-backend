import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { describirError } from '../configuracion/conexion-base-datos.servicio.js';
import { RestablecerClaveVendedorCasoUso } from '../modulos/usuarios/index.js';
import { ejecutarComandoRestablecerClaveVendedor } from '../modulos/usuarios/presentacion/cli/restablecer-clave-vendedor.comando.js';
import { CrearVendedorModule } from './crear-vendedor.module.js';

/**
 * Punto de entrada de `npm run restablecer-clave-vendedor` (RF-USU-05, D-35).
 *
 * Lee VENDEDOR_CLAVE_NUEVA (defínala solo en la terminal), cambia la clave
 * del único Vendedor, cierra todas sus sesiones y registra
 * `CLAVE_RESTABLECIDA` (`origen: COMANDO_SERVIDOR`). Nunca escribe la clave.
 */
async function principal(): Promise<number> {
  const logger = new Logger('RestablecerClaveVendedor');
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
    return await ejecutarComandoRestablecerClaveVendedor(
      contexto.get(RestablecerClaveVendedorCasoUso),
      (nombre) => configuracion.get<string>(nombre),
      {
        informar: (mensaje) => process.stdout.write(`${mensaje}\n`),
        error: (mensaje) => logger.error(mensaje),
      },
    );
  } finally {
    await contexto.close();
  }
}

process.exitCode = await principal();
