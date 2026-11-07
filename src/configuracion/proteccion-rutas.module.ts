import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditoriaModule } from '../modulos/auditoria/index.js';
import {
  GuardRoles,
  GuardTokenAcceso,
  UsuariosModule,
} from '../modulos/usuarios/index.js';

/**
 * Protección de rutas por rol (RF-USU-03, CA-02, subfase 1.4).
 *
 * Registra dos guards globales, en este orden:
 * 1. `GuardTokenAcceso`: toda ruta exige un token de acceso válido salvo las
 *    marcadas con `@Publico()` (401 `NO_AUTENTICADO` / `TOKEN_VENCIDO`).
 * 2. `GuardRoles`: si la ruta declara `@Roles(...)`, el rol del token debe
 *    estar en la lista (403 `NO_AUTORIZADO`).
 *
 * Orden respecto del límite de intentos (D-17): NestJS ejecuta los guards
 * globales en el orden en que registra sus módulos, que sigue el orden de
 * `imports` de `AppModule`. Este módulo va **después** de
 * `LimiteIntentosModule`, así los intentos se cuentan antes de verificar el
 * token. Lo comprueba una prueba e2e (`autorizacion.e2e-spec.ts`).
 */
@Module({
  // AuditoriaModule: `GuardRoles` registra los 403 como `ACCESO_DENEGADO` (D-18).
  imports: [UsuariosModule, AuditoriaModule],
  providers: [
    { provide: APP_GUARD, useClass: GuardTokenAcceso },
    { provide: APP_GUARD, useClass: GuardRoles },
  ],
})
export class ProteccionRutasModule {}
