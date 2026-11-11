import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GENERADOR_ID,
  type GeneradorId,
} from '../../compartido/aplicacion/generador-id.puerto.js';
import { RELOJ, type Reloj } from '../../compartido/aplicacion/reloj.puerto.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { GeneradorIdUuid } from '../../compartido/infraestructura/generador-id-uuid.js';
import { RelojSistema } from '../../compartido/infraestructura/reloj-sistema.js';
import { UnidadDeTrabajoTypeorm } from '../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type { VariablesEntorno } from '../../configuracion/variables-entorno.js';
import {
  AuditoriaModule,
  SERVICIO_AUDITORIA,
  type ServicioAuditoria,
} from '../auditoria/index.js';
import { CambiarClaveCasoUso } from './aplicacion/casos-uso/cambiar-clave.caso-uso.js';
import { CerrarSesionCasoUso } from './aplicacion/casos-uso/cerrar-sesion.caso-uso.js';
import { GenerarCodigoRecuperacionCasoUso } from './aplicacion/casos-uso/generar-codigo-recuperacion.caso-uso.js';
import { ListarClientesCasoUso } from './aplicacion/casos-uso/listar-clientes.caso-uso.js';
import { RecuperarClaveCasoUso } from './aplicacion/casos-uso/recuperar-clave.caso-uso.js';
import { RestablecerClaveVendedorCasoUso } from './aplicacion/casos-uso/restablecer-clave-vendedor.caso-uso.js';
import {
  CODIGO_RECUPERACION_REPOSITORIO,
  type CodigoRecuperacionRepositorio,
} from './aplicacion/puertos/codigo-recuperacion.repositorio.js';
import {
  PROTECTOR_CODIGO_RECUPERACION,
  type ProtectorCodigoRecuperacion,
} from './aplicacion/puertos/protector-codigo-recuperacion.puerto.js';
import { CodigoRecuperacionOrmEntity } from './infraestructura/persistencia/codigo-recuperacion.orm-entity.js';
import { CodigoRecuperacionRepositorioTypeorm } from './infraestructura/persistencia/codigo-recuperacion.repositorio.typeorm.js';
import { ProtectorCodigoRecuperacionCrypto } from './infraestructura/seguridad/protector-codigo-recuperacion.crypto.js';
import { ConsultarAvisoPrivacidadCasoUso } from './aplicacion/casos-uso/consultar-aviso-privacidad.caso-uso.js';
import { ConsultarResumenesUsuariosCasoUso } from './aplicacion/casos-uso/consultar-resumenes-usuarios.caso-uso.js';
import { ConsultarUsuarioActualCasoUso } from './aplicacion/casos-uso/consultar-usuario-actual.caso-uso.js';
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
import { PrivacidadController } from './presentacion/http/privacidad.controller.js';
import { UsuariosController } from './presentacion/http/usuarios.controller.js';

type Configuracion = ConfigService<VariablesEntorno, true>;

/**
 * Módulo de usuarios (RF-USU-01, RF-USU-02, RNF-02, RNF-16, D-07, D-09, D-19).
 * - 1.2: modelo, roles, hash de claves y Vendedor semilla.
 * - 1.3: registro del Cliente, ingreso por canal, renovación con rotación,
 *   salida y aviso de privacidad.
 * - 1.4: `GET /usuarios/yo`, guards de autenticación y de roles, `@Roles`,
 *   `@UsuarioActual` y la regla de propiedad. Los guards se registran como
 *   globales en `ProteccionRutasModule`, no aquí: así el comando
 *   `crear-vendedor`, que importa este módulo, no carga guards HTTP.
 * - 1.5: registra en la bitácora (`AuditoriaModule`) el registro, los
 *   ingresos, la salida, la reutilización de tokens y el Vendedor semilla; las
 *   escrituras de datos van con su registro en una sola transacción.
 * - F1+ (RF-USU-05, D-35, D-39): lista de Clientes del panel, código de
 *   recuperación generado por el Vendedor, recuperación con código, cambio
 *   de clave con sesión y restablecimiento de la clave del Vendedor por comando.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsuarioOrmEntity,
      SesionOrmEntity,
      CodigoRecuperacionOrmEntity,
    ]),
    // 1.5: registrar actividades en la bitácora (RF-USU-04).
    AuditoriaModule,
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
    { provide: UNIDAD_DE_TRABAJO, useClass: UnidadDeTrabajoTypeorm },
    {
      provide: CrearVendedorCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        GENERADOR_HASH,
        GENERADOR_ID,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        generadorHash: GeneradorHash,
        generadorId: GeneradorId,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new CrearVendedorCasoUso(
          usuarios,
          generadorHash,
          generadorId,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: RegistrarClienteCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        GENERADOR_HASH,
        FUENTE_AVISO_PRIVACIDAD,
        GENERADOR_ID,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        generadorHash: GeneradorHash,
        aviso: FuenteAvisoPrivacidad,
        generadorId: GeneradorId,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new RegistrarClienteCasoUso(
          usuarios,
          generadorHash,
          aviso,
          generadorId,
          reloj,
          unidadTrabajo,
          auditoria,
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
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
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
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
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
          unidadTrabajo,
          auditoria,
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
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        emisor: EmisorTokenAcceso,
        generadorToken: GeneradorTokenRenovacion,
        generadorId: GeneradorId,
        reloj: Reloj,
        configuracion: ConfiguracionSesion,
        auditoria: ServicioAuditoria,
      ) =>
        new RenovarSesionCasoUso(
          usuarios,
          sesiones,
          emisor,
          generadorToken,
          generadorId,
          reloj,
          configuracion,
          auditoria,
        ),
    },
    {
      provide: CerrarSesionCasoUso,
      inject: [
        SESION_REPOSITORIO,
        GENERADOR_TOKEN_RENOVACION,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        sesiones: SesionRepositorio,
        generadorToken: GeneradorTokenRenovacion,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new CerrarSesionCasoUso(
          sesiones,
          generadorToken,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: ConsultarAvisoPrivacidadCasoUso,
      inject: [FUENTE_AVISO_PRIVACIDAD],
      useFactory: (fuente: FuenteAvisoPrivacidad) =>
        new ConsultarAvisoPrivacidadCasoUso(fuente),
    },
    {
      provide: ConsultarUsuarioActualCasoUso,
      inject: [USUARIO_REPOSITORIO],
      useFactory: (usuarios: UsuarioRepositorio) =>
        new ConsultarUsuarioActualCasoUso(usuarios),
    },
    {
      provide: ConsultarResumenesUsuariosCasoUso,
      inject: [USUARIO_REPOSITORIO],
      useFactory: (usuarios: UsuarioRepositorio) =>
        new ConsultarResumenesUsuariosCasoUso(usuarios),
    },
    // RF-USU-05: recuperación asistida y cambio de clave (D-35, D-39).
    {
      provide: CODIGO_RECUPERACION_REPOSITORIO,
      useClass: CodigoRecuperacionRepositorioTypeorm,
    },
    {
      provide: PROTECTOR_CODIGO_RECUPERACION,
      inject: [ConfigService],
      useFactory: (configuracion: Configuracion) =>
        new ProtectorCodigoRecuperacionCrypto(
          configuracion.get('RECUPERACION_SECRETO', { infer: true }),
        ),
    },
    {
      provide: ListarClientesCasoUso,
      inject: [USUARIO_REPOSITORIO, CODIGO_RECUPERACION_REPOSITORIO, RELOJ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        codigos: CodigoRecuperacionRepositorio,
        reloj: Reloj,
      ) => new ListarClientesCasoUso(usuarios, codigos, reloj),
    },
    {
      provide: GenerarCodigoRecuperacionCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        CODIGO_RECUPERACION_REPOSITORIO,
        PROTECTOR_CODIGO_RECUPERACION,
        GENERADOR_ID,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        codigos: CodigoRecuperacionRepositorio,
        protector: ProtectorCodigoRecuperacion,
        generadorId: GeneradorId,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new GenerarCodigoRecuperacionCasoUso(
          usuarios,
          codigos,
          protector,
          generadorId,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: RecuperarClaveCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        SESION_REPOSITORIO,
        CODIGO_RECUPERACION_REPOSITORIO,
        PROTECTOR_CODIGO_RECUPERACION,
        GENERADOR_HASH,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        codigos: CodigoRecuperacionRepositorio,
        protector: ProtectorCodigoRecuperacion,
        generadorHash: GeneradorHash,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new RecuperarClaveCasoUso(
          usuarios,
          sesiones,
          codigos,
          protector,
          generadorHash,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: CambiarClaveCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        SESION_REPOSITORIO,
        GENERADOR_HASH,
        GENERADOR_TOKEN_RENOVACION,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        generadorHash: GeneradorHash,
        generadorToken: GeneradorTokenRenovacion,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new CambiarClaveCasoUso(
          usuarios,
          sesiones,
          generadorHash,
          generadorToken,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
    {
      provide: RestablecerClaveVendedorCasoUso,
      inject: [
        USUARIO_REPOSITORIO,
        SESION_REPOSITORIO,
        GENERADOR_HASH,
        RELOJ,
        UNIDAD_DE_TRABAJO,
        SERVICIO_AUDITORIA,
      ],
      useFactory: (
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        generadorHash: GeneradorHash,
        reloj: Reloj,
        unidadTrabajo: UnidadDeTrabajo,
        auditoria: ServicioAuditoria,
      ) =>
        new RestablecerClaveVendedorCasoUso(
          usuarios,
          sesiones,
          generadorHash,
          reloj,
          unidadTrabajo,
          auditoria,
        ),
    },
  ],
  // EMISOR_TOKEN_ACCESO se exporta para el guard global de autenticación,
  // que se registra en `ProteccionRutasModule` (subfase 1.4).
  // ConsultarResumenesUsuariosCasoUso es el servicio público con el que la
  // bitácora muestra `{ id, nombre, rol }` (subfase 1.5).
  // RestablecerClaveVendedorCasoUso: para `npm run restablecer-clave-vendedor`.
  exports: [
    CrearVendedorCasoUso,
    RestablecerClaveVendedorCasoUso,
    EMISOR_TOKEN_ACCESO,
    ConsultarResumenesUsuariosCasoUso,
  ],
})
export class UsuariosModule {}
