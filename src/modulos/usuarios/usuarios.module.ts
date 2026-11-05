import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GENERADOR_ID,
  type GeneradorId,
} from '../../compartido/aplicacion/generador-id.puerto.js';
import { RELOJ, type Reloj } from '../../compartido/aplicacion/reloj.puerto.js';
import { GeneradorIdUuid } from '../../compartido/infraestructura/generador-id-uuid.js';
import { RelojSistema } from '../../compartido/infraestructura/reloj-sistema.js';
import type { VariablesEntorno } from '../../configuracion/variables-entorno.js';
import { CrearVendedorCasoUso } from './aplicacion/casos-uso/crear-vendedor.caso-uso.js';
import {
  GENERADOR_HASH,
  type GeneradorHash,
} from './aplicacion/puertos/generador-hash.puerto.js';
import {
  USUARIO_REPOSITORIO,
  type UsuarioRepositorio,
} from './aplicacion/puertos/usuario.repositorio.js';
import { UsuarioOrmEntity } from './infraestructura/persistencia/usuario.orm-entity.js';
import { UsuarioRepositorioTypeorm } from './infraestructura/persistencia/usuario.repositorio.typeorm.js';
import { GeneradorHashBcrypt } from './infraestructura/seguridad/generador-hash.bcrypt.js';

/**
 * Módulo de usuarios (RF-USU-02, RNF-02, D-07).
 * Subfase 1.2: modelo, roles, hash de claves y creación del Vendedor semilla.
 * Las rutas HTTP (registro, ingreso, `/usuarios/yo`) llegan en 1.3 y 1.4.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UsuarioOrmEntity])],
  providers: [
    { provide: USUARIO_REPOSITORIO, useClass: UsuarioRepositorioTypeorm },
    {
      provide: GENERADOR_HASH,
      inject: [ConfigService],
      useFactory: (configuracion: ConfigService<VariablesEntorno, true>) =>
        new GeneradorHashBcrypt(
          configuracion.get('BCRYPT_COSTO', { infer: true }),
        ),
    },
    { provide: GENERADOR_ID, useClass: GeneradorIdUuid },
    { provide: RELOJ, useClass: RelojSistema },
    {
      provide: CrearVendedorCasoUso,
      inject: [USUARIO_REPOSITORIO, GENERADOR_HASH, GENERADOR_ID, RELOJ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        generadorHash: GeneradorHash,
        generadorId: GeneradorId,
        reloj: Reloj,
      ) =>
        new CrearVendedorCasoUso(usuarios, generadorHash, generadorId, reloj),
    },
  ],
  exports: [CrearVendedorCasoUso],
})
export class UsuariosModule {}
