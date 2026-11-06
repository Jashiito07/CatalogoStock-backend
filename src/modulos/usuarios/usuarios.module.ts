import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GENERADOR_ID,
  type GeneradorId,
} from '../../compartido/aplicacion/generador-id.puerto.js';
import { RELOJ, type Reloj } from '../../compartido/aplicacion/reloj.puerto.js';
import { GeneradorIdUuid } from '../../compartido/infraestructura/generador-id-uuid.js';
import { RelojSistema } from '../../compartido/infraestructura/reloj-sistema.js';
import type { VariablesEntorno } from '../../configuracion/variables-entorno.js';
import { CerrarSesionCasoUso } from './aplicacion/casos-uso/cerrar-sesion.caso-uso.js';
import { ConsultarAvisoPrivacidadCasoUso } from './aplicacion/casos-uso/consultar-aviso-privacidad.caso-uso.js';
import { CrearVendedorCasoUso } from './aplicacion/casos-uso/crear-vendedor.caso-uso.js';
import { IniciarSesionCasoUso } from './aplicacion/casos-uso/iniciar-sesion.caso-uso.js';
import { RegistrarClienteCasoUso } from './aplicacion/casos-uso/registrar-cliente.caso-uso.js';
import { RenovarSesionCasoUso } from './aplicacion/casos-uso/renovar-sesion.caso-uso.js';
import {
  CONFIGURACION_SESION,
  type ConfiguracionSesion,
} from './aplicacion/puertos/configuracion-sesion.js';
import {
  EMISOR_TOKEN_ACCESO,
  type EmisorTokenAcceso,
} from './aplicacion/puertos/emisor-token-acceso.puerto.js';
import {
  FUENTE_AVISO_PRIVACIDAD,
  type FuenteAvisoPrivacidad,
} from './aplicacion/puertos/fuente-aviso-privacidad.puerto.js';
import {
  GENERADOR_HASH,
  type GeneradorHash,
} from './aplicacion/puertos/generador-hash.puerto.js';
import {
  GENERADOR_TOKEN_RENOVACION,
  type GeneradorTokenRenovacion,
} from './aplicacion/puertos/generador-token-renovacion.puerto.js';
import {
  SESION_REPOSITORIO,
  type SesionRepositorio,
} from './aplicacion/puertos/sesion.repositorio.js';
import {
  USUARIO_REPOSITORIO,
  type UsuarioRepositorio,
} from './aplicacion/puertos/usuario.repositorio.js';
import { SesionOrmEntity } from './infraestructura/persistencia/sesion.orm-entity.js';
import { SesionRepositorioTypeorm } from './infraestructura/persistencia/sesion.repositorio.typeorm.js';
import { UsuarioOrmEntity } from './infraestructura/persistencia/usuario.orm-entity.js';
import { UsuarioRepositorioTypeorm } from './infraestructura/persistencia/usuario.repositorio.typeorm.js';
import { FuenteAvisoPrivacidadEstatica } from './infraestructura/privacidad/fuente-aviso-privacidad.estatica.js';
import {
  ALGORITMO_JWT,
  EmisorTokenAccesoJwt,
} from './infraestructura/seguridad/emisor-token-acceso.jwt.js';
import { GeneradorHashBcrypt } from './infraestructura/seguridad/generador-hash.bcrypt.js';
import { GeneradorTokenRenovacionCrypto } from './infraestructura/seguridad/generador-token-renovacion.crypto.js';
import { AutenticacionController } from './presentacion/http/autenticacion.controller.js';
import { GuardTokenAcceso } from './presentacion/http/guard-token-acceso.js';
import { PrivacidadController } from './presentacion/http/privacidad.controller.js';
import { UsuariosController } from './presentacion/http/usuarios.controller.js';

type Configuracion = ConfigService<VariablesEntorno, true>;

/**
 * Módulo de usuarios (RF-USU-01, RF-USU-02, RNF-02, RNF-16, D-07, D-09, D-19).
 * - 1.2: modelo, roles, hash de claves y Vendedor semilla.
 * - 1.3: registro del Cliente, ingreso por canal, renovación con rotación,
 *   salida y aviso de privacidad.
 * - 1.4 (pendiente): guard global de autenticación y roles, `GET /usuarios/yo`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UsuarioOrmEntity, SesionOrmEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configuracion: Configuracion) => ({
        secret: configuracion.get('JWT_SECRETO', { infer: true }),
        signOptions: { algorithm: ALGORITMO_JWT },
        verifyOptions: { algorithms: [ALGORITMO_JWT] },
      }),
    }),
  ],
  controllers: [
    UsuariosController,
    AutenticacionController,
    PrivacidadController,
  ],
  providers: [
    { provide: USUARIO_REPOSITORIO, useClass: UsuarioRepositorioTypeorm },
    { provide: SESION_REPOSITORIO, useClass: SesionRepositorioTypeorm },
    {
      provide: GENERADOR_HASH,
      inject: [ConfigService],
      useFactory: (configuracion: Configuracion) =>
        new GeneradorHashBcrypt(
          configuracion.get('BCRYPT_COSTO', { infer: true }),
        ),
    },
    {
      provide: CONFIGURACION_SESION,
      inject: [ConfigService],
      useFactory: (configuracion: Configuracion): ConfiguracionSesion => ({
        vidaAccesoSegundos: configuracion.get('JWT_VIDA_ACCESO_SEGUNDOS', {
          infer: true,
        }),
        vidaRenovacionDias: configuracion.get('RENOVACION_VIDA_DIAS', {
          infer: true,
        }),
      }),
    },
    {
      provide: EMISOR_TOKEN_ACCESO,
      inject: [JwtService, CONFIGURACION_SESION],
      useFactory: (jwt: JwtService, configuracion: ConfiguracionSesion) =>
        new EmisorTokenAccesoJwt(jwt, configuracion.vidaAccesoSegundos),
    },
    {
      provide: GENERADOR_TOKEN_RENOVACION,
      useClass: GeneradorTokenRenovacionCrypto,
    },
    {
      provide: FUENTE_AVISO_PRIVACIDAD,
      useFactory: () => new FuenteAvisoPrivacidadEstatica(),
    },
    { provide: GENERADOR_ID, useClass: GeneradorIdUuid },
    { provide: RELOJ, useClass: RelojSistema },
    GuardTokenAcceso,
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
    {
      provide: RegistrarClienteCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        GENERADOR_HASH,
        FUENTE_AVISO_PRIVACIDAD,
        GENERADOR_ID,
        RELOJ,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        generadorHash: GeneradorHash,
        aviso: FuenteAvisoPrivacidad,
        generadorId: GeneradorId,
        reloj: Reloj,
      ) =>
        new RegistrarClienteCasoUso(
          usuarios,
          generadorHash,
          aviso,
          generadorId,
          reloj,
        ),
    },
    {
      provide: IniciarSesionCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        SESION_REPOSITORIO,
        GENERADOR_HASH,
        EMISOR_TOKEN_ACCESO,
        GENERADOR_TOKEN_RENOVACION,
        GENERADOR_ID,
        RELOJ,
        CONFIGURACION_SESION,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        generadorHash: GeneradorHash,
        emisor: EmisorTokenAcceso,
        generadorToken: GeneradorTokenRenovacion,
        generadorId: GeneradorId,
        reloj: Reloj,
        configuracion: ConfiguracionSesion,
      ) =>
        new IniciarSesionCasoUso(
          usuarios,
          sesiones,
          generadorHash,
          emisor,
          generadorToken,
          generadorId,
          reloj,
          configuracion,
        ),
    },
    {
      provide: RenovarSesionCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        SESION_REPOSITORIO,
        EMISOR_TOKEN_ACCESO,
        GENERADOR_TOKEN_RENOVACION,
        GENERADOR_ID,
        RELOJ,
        CONFIGURACION_SESION,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        emisor: EmisorTokenAcceso,
        generadorToken: GeneradorTokenRenovacion,
        generadorId: GeneradorId,
        reloj: Reloj,
        configuracion: ConfiguracionSesion,
      ) =>
        new RenovarSesionCasoUso(
          usuarios,
          sesiones,
          emisor,
          generadorToken,
          generadorId,
          reloj,
          configuracion,
        ),
    },
    {
      provide: CerrarSesionCasoUso,
      inject: [SESION_REPOSITORIO, GENERADOR_TOKEN_RENOVACION, RELOJ],
      useFactory: (
        sesiones: SesionRepositorio,
        generadorToken: GeneradorTokenRenovacion,
        reloj: Reloj,
      ) => new CerrarSesionCasoUso(sesiones, generadorToken, reloj),
    },
    {
      provide: ConsultarAvisoPrivacidadCasoUso,
      inject: [FUENTE_AVISO_PRIVACIDAD],
      useFactory: (fuente: FuenteAvisoPrivacidad) =>
        new ConsultarAvisoPrivacidadCasoUso(fuente),
    },
  ],
  // GuardTokenAcceso y EMISOR_TOKEN_ACCESO se exportan para el guard global de 1.4.
  exports: [CrearVendedorCasoUso, GuardTokenAcceso, EMISOR_TOKEN_ACCESO],
})
export class UsuariosModule {}
