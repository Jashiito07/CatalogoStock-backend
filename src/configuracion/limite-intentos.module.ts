import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  crearOpcionesLimiteIntentos,
  GuardLimiteIntentos,
} from '../compartido/presentacion/limite-intentos.js';

/**
 * Límite de intentos por IP con `@nestjs/throttler` (D-17).
 *
 * El guard es global, pero solo cuenta las rutas marcadas con
 * `@LimiteIntentos(grupo)`. Se registra antes que cualquier guard de
 * autenticación (subfase 1.4) para frenar los intentos antes de verificar
 * credenciales. El contador vive en memoria: con varias instancias de la API
 * habría que compartirlo (fuera del alcance de la primera versión).
 */
@Module({
  imports: [ThrottlerModule.forRoot(crearOpcionesLimiteIntentos())],
  providers: [{ provide: APP_GUARD, useClass: GuardLimiteIntentos }],
})
export class LimiteIntentosModule {}
