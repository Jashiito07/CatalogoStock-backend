import { Module } from '@nestjs/common';
import { RELOJ, type Reloj } from '../../compartido/aplicacion/reloj.puerto.js';
import { RelojSistema } from '../../compartido/infraestructura/reloj-sistema.js';
import { ConsultarSaludCasoUso } from './aplicacion/casos-uso/consultar-salud.caso-uso.js';
import {
  COMPROBADOR_BASE_DATOS,
  type ComprobadorBaseDatos,
} from './aplicacion/puertos/comprobador-base-datos.puerto.js';
import { ComprobadorBaseDatosTypeorm } from './infraestructura/comprobador-base-datos.typeorm.js';
import { SaludController } from './presentacion/salud.controller.js';

@Module({
  controllers: [SaludController],
  providers: [
    { provide: COMPROBADOR_BASE_DATOS, useClass: ComprobadorBaseDatosTypeorm },
    { provide: RELOJ, useClass: RelojSistema },
    {
      provide: ConsultarSaludCasoUso,
      inject: [COMPROBADOR_BASE_DATOS, RELOJ],
      useFactory: (comprobador: ComprobadorBaseDatos, reloj: Reloj) =>
        new ConsultarSaludCasoUso(comprobador, reloj),
    },
  ],
})
export class SaludModule {}
