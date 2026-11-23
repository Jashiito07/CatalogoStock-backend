import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VariablesEntorno } from '../../configuracion/variables-entorno.js';
import { ConsultarPoliticasCasoUso } from './aplicacion/consultar-politicas.caso-uso.js';
import { PoliticasController } from './presentacion/http/politicas.controller.js';

/**
 * Políticas públicas (RF-USU-07): privacidad, términos y eliminar cuenta, más
 * `GET /api/v1/politicas`. No tiene tablas ni depende de otros módulos.
 */
@Module({
  controllers: [PoliticasController],
  providers: [
    {
      provide: ConsultarPoliticasCasoUso,
      inject: [ConfigService],
      useFactory: (configuracion: ConfigService<VariablesEntorno, true>) =>
        new ConsultarPoliticasCasoUso(
          configuracion.get('URL_PUBLICA', { infer: true }),
        ),
    },
  ],
})
export class PoliticasModule {}
