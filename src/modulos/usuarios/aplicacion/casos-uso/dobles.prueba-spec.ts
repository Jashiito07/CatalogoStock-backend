/**
 * Dobles en memoria para las pruebas unitarias de los casos de uso de usuarios.
 * El nombre termina en `spec.ts` para que no se compile en `dist/`, pero no
 * en `.spec.ts`, para que Vitest no lo tome como archivo de pruebas.
 */
import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type {
  RegistrarActividad,
  ServicioAuditoria,
} from '../../../auditoria/index.js';
import type { AvisoPrivacidad } from '../../dominio/aviso-privacidad.js';
import { Correo } from '../../dominio/correo.js';
import {
  CorreoYaRegistradoError,
  VendedorYaExisteError,
} from '../../dominio/errores-usuario.js';
import { NombreUsuario } from '../../dominio/nombre-usuario.js';
import type { Rol } from '../../dominio/rol.js';
import { type MotivoRevocacion, Sesion } from '../../dominio/sesion.js';
import { Telefono } from '../../dominio/telefono.js';
import { Usuario } from '../../dominio/usuario.js';
import type { ConfiguracionSesion } from '../puertos/configuracion-sesion.js';
import type {
  EmisorTokenAcceso,
  IdentidadTokenAcceso,
  TokenAccesoEmitido,
} from '../puertos/emisor-token-acceso.puerto.js';
import type { FuenteAvisoPrivacidad } from '../puertos/fuente-aviso-privacidad.puerto.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { GeneradorTokenRenovacion } from '../puertos/generador-token-renovacion.puerto.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export const INICIO = new Date('2026-11-05T15:00:00.000Z');
export const UN_DIA_MS = 24 * 60 * 60 * 1000;

export const CONFIGURACION: ConfiguracionSesion = {
  vidaAccesoSegundos: 900,
  vidaRenovacionDias: 7,
};

export const AVISO_VIGENTE: AvisoPrivacidad = {
  version: '2026-11-1',
  titulo: 'Aviso de prueba',
  contenido: 'PROVISIONAL – texto de prueba',
  vigenteDesde: new Date('2026-11-05T05:00:00.000Z'),
};

export class RelojFalso implements Reloj {
  constructor(public actual: Date = INICIO) {}

  ahora(): Date {
    return this.actual;
  }

  avanzar(milisegundos: number): void {
    this.actual = new Date(this.actual.getTime() + milisegundos);
  }
}

export function generadorIdSecuencial(): GeneradorId {
  let siguiente = 1;
  return {
    generar: () =>
      `00000000-0000-4000-8000-${String(siguiente++).padStart(12, '0')}`,
  };
}

/** Repositorio en memoria con las mismas reglas de unicidad que la tabla. */
export class UsuarioRepositorioEnMemoria implements UsuarioRepositorio {
  readonly usuarios: Usuario[] = [];

  buscarPorId(id: string): Promise<Usuario | null> {
    return Promise.resolve(this.usuarios.find((u) => u.id === id) ?? null);
  }

  buscarPorIds(ids: readonly string[]): Promise<Usuario[]> {
    return Promise.resolve(this.usuarios.filter((u) => ids.includes(u.id)));
  }

  buscarPorCorreo(correo: Correo): Promise<Usuario | null> {
    return Promise.resolve(
      this.usuarios.find((u) => u.correo.esIgualA(correo)) ?? null,
    );
  }

  existeConRol(rol: Rol): Promise<boolean> {
    return Promise.resolve(this.usuarios.some((u) => u.rol === rol));
  }

  crear(usuario: Usuario): Promise<void> {
    if (this.usuarios.some((u) => u.correo.esIgualA(usuario.correo))) {
      return Promise.reject(new CorreoYaRegistradoError());
    }
    if (usuario.esVendedor() && this.usuarios.some((u) => u.esVendedor())) {
      return Promise.reject(new VendedorYaExisteError());
    }
    this.usuarios.push(usuario);
    return Promise.resolve();
  }
}

/** Copia independiente: el repositorio no comparte objetos con el caso de uso. */
function copiar(sesion: Sesion): Sesion {
  return Sesion.reconstituir({
    ...sesion.toJSON(),
    hashToken: sesion.hashToken,
  });
}

/** Repositorio de sesiones en memoria con la misma atomicidad que el adaptador TypeORM. */
export class SesionRepositorioEnMemoria implements SesionRepositorio {
  readonly sesiones: Sesion[] = [];

  crear(sesion: Sesion): Promise<void> {
    if (this.sesiones.some((s) => s.hashToken === sesion.hashToken)) {
      return Promise.reject(new Error('hash_token duplicado'));
    }
    this.sesiones.push(copiar(sesion));
    return Promise.resolve();
  }

  buscarPorHashToken(hashToken: string): Promise<Sesion | null> {
    const fila = this.sesiones.find((s) => s.hashToken === hashToken);
    return Promise.resolve(fila ? copiar(fila) : null);
  }

  guardarRotacion(anterior: Sesion, siguiente: Sesion): Promise<boolean> {
    const indice = this.sesiones.findIndex((s) => s.id === anterior.id);
    if (indice < 0 || this.sesiones[indice].revocadaEn !== null) {
      return Promise.resolve(false);
    }
    this.sesiones[indice] = copiar(anterior);
    this.sesiones.push(copiar(siguiente));
    return Promise.resolve(true);
  }

  revocarFamilia(
    familia: string,
    motivo: Exclude<MotivoRevocacion, 'ROTADA'>,
    ahora: Date,
  ): Promise<number> {
    let revocadas = 0;
    this.sesiones.forEach((sesion, indice) => {
      if (sesion.familia === familia && sesion.revocadaEn === null) {
        this.sesiones[indice] = Sesion.reconstituir({
          ...sesion.toJSON(),
          hashToken: sesion.hashToken,
          revocadaEn: ahora,
          motivoRevocacion: motivo,
        });
        revocadas++;
      }
    });
    return Promise.resolve(revocadas);
  }

  vigentes(ahora: Date): Sesion[] {
    return this.sesiones.filter((s) => s.estadoEn(ahora) === 'VIGENTE');
  }
}

/** Hash falso y rápido: `hash:<clave>`. Cuenta las comparaciones. */
export class GeneradorHashFalso implements GeneradorHash {
  readonly generadas: string[] = [];
  comparaciones = 0;

  generar(clave: string): Promise<string> {
    this.generadas.push(clave);
    return Promise.resolve(`hash:${clave}`);
  }

  comparar(clave: string, hash: string): Promise<boolean> {
    this.comparaciones++;
    return Promise.resolve(hash === `hash:${clave}`);
  }
}

export class EmisorTokenAccesoFalso implements EmisorTokenAcceso {
  readonly emitidos: IdentidadTokenAcceso[] = [];

  emitir(
    identidad: IdentidadTokenAcceso,
    ahora: Date,
  ): Promise<TokenAccesoEmitido> {
    this.emitidos.push(identidad);
    return Promise.resolve({
      token: `acceso:${identidad.idUsuario}:${identidad.rol}`,
      venceEn: new Date(
        ahora.getTime() + CONFIGURACION.vidaAccesoSegundos * 1000,
      ),
    });
  }

  verificar(): Promise<IdentidadTokenAcceso> {
    return Promise.reject(new Error('no se usa en estas pruebas'));
  }
}

/** Tokens `token-1`, `token-2`…; hash `h(<token>)`. */
export class GeneradorTokenFalso implements GeneradorTokenRenovacion {
  private siguiente = 1;

  generar(): string {
    return `token-${this.siguiente++}`;
  }

  calcularHash(token: string): string {
    return `h(${token})`;
  }
}

export class FuenteAvisoFalsa implements FuenteAvisoPrivacidad {
  obtenerVigente(): AvisoPrivacidad {
    return AVISO_VIGENTE;
  }
}

/** Unidad de trabajo en memoria: ejecuta el trabajo y recuerda si hay una transacción abierta. */
export class UnidadDeTrabajoFalsa implements UnidadDeTrabajo {
  activa = false;
  transacciones = 0;

  async ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    this.transacciones++;
    this.activa = true;
    try {
      return await trabajo();
    } finally {
      this.activa = false;
    }
  }
}

export interface ActividadRegistrada {
  actividad: RegistrarActividad;
  /** `true` si se registró dentro de `UnidadDeTrabajoFalsa.ejecutar`. */
  enTransaccion: boolean;
  /** `true` si se usó `registrarSinInterrumpir`. */
  sinInterrumpir: boolean;
}

/** Bitácora en memoria; con `fallo` definido, `registrar` falla y `registrarSinInterrumpir` lo ignora. */
export class AuditoriaFalsa implements ServicioAuditoria {
  readonly registradas: ActividadRegistrada[] = [];
  fallo: Error | undefined;

  constructor(private readonly unidad?: UnidadDeTrabajoFalsa) {}

  registrar(actividad: RegistrarActividad): Promise<void> {
    if (this.fallo) {
      return Promise.reject(this.fallo);
    }
    this.anotar(actividad, false);
    return Promise.resolve();
  }

  registrarSinInterrumpir(actividad: RegistrarActividad): Promise<void> {
    if (!this.fallo) {
      this.anotar(actividad, true);
    }
    return Promise.resolve();
  }

  acciones(): string[] {
    return this.registradas.map((r) => r.actividad.accion);
  }

  private anotar(actividad: RegistrarActividad, sinInterrumpir: boolean): void {
    this.registradas.push({
      actividad: structuredClone(actividad),
      enTransaccion: this.unidad?.activa ?? false,
      sinInterrumpir,
    });
  }
}

export const CLAVE_VALIDA = 'Catalogo2026';

export function crearCliente(
  id: string,
  correo: string,
  clave: string = CLAVE_VALIDA,
): Usuario {
  return Usuario.crearCliente({
    id,
    nombre: NombreUsuario.crear('Cliente de Prueba'),
    correo: Correo.crear(correo),
    telefono: Telefono.crear('0991234567'),
    hashClave: `hash:${clave}`,
    versionPrivacidad: AVISO_VIGENTE.version,
    ahora: INICIO,
  });
}

export function crearVendedor(
  id: string,
  correo: string,
  clave: string = CLAVE_VALIDA,
): Usuario {
  return Usuario.crearVendedor({
    id,
    nombre: NombreUsuario.crear('Vendedor de Prueba'),
    correo: Correo.crear(correo),
    telefono: Telefono.crear('0987654321'),
    hashClave: `hash:${clave}`,
    ahora: INICIO,
  });
}

/** Mismo usuario pero inactivo (no hay caso de uso para desactivar en F1). */
export function desactivar(usuario: Usuario): Usuario {
  return Usuario.reconstituir({
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    telefono: usuario.telefono,
    hashClave: usuario.hashClave,
    rol: usuario.rol,
    activo: false,
    privacidadAceptadaEn: usuario.privacidadAceptadaEn,
    versionPrivacidad: usuario.versionPrivacidad,
    creadoEn: usuario.creadoEn,
    actualizadoEn: usuario.actualizadoEn,
  });
}
