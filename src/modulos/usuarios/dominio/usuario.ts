import { ReglaNegocioError } from '../../../compartido/dominio/errores.js';
import type { Correo } from './correo.js';
import type { NombreUsuario } from './nombre-usuario.js';
import type { Rol } from './rol.js';
import type { Telefono } from './telefono.js';

export interface PropiedadesUsuario {
  id: string;
  nombre: NombreUsuario;
  correo: Correo;
  telefono: Telefono;
  /** Hash adaptativo de la clave (RNF-02). Nunca la clave en texto plano. */
  hashClave: string;
  rol: Rol;
  activo: boolean;
  /** `null` solo para el Vendedor creado por el comando semilla (contrato de usuarios). */
  privacidadAceptadaEn: Date | null;
  /** Versión del aviso aceptado (D-11); `null` solo para el Vendedor semilla. */
  versionPrivacidad: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

interface DatosNuevoUsuario {
  id: string;
  nombre: NombreUsuario;
  correo: Correo;
  telefono: Telefono;
  hashClave: string;
  ahora: Date;
}

export interface DatosNuevoCliente extends DatosNuevoUsuario {
  versionPrivacidad: string;
}

export type DatosNuevoVendedor = DatosNuevoUsuario;

/** Datos públicos del usuario: nunca la clave, su hash ni tokens (contrato de usuarios). */
export interface UsuarioPublico {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: Rol;
  privacidadAceptadaEn: Date | null;
  versionPrivacidad: string | null;
  creadoEn: Date;
}

/**
 * Entidad Usuario (RF-USU-02). TypeScript puro, sin decoradores de TypeORM.
 *
 * Invariantes:
 * - El hash de la clave no puede estar vacío (RNF-02: nunca se guarda la clave).
 * - Un Cliente siempre tiene la fecha y la versión del aviso de privacidad
 *   aceptado (RNF-16, PA-12). Solo el Vendedor semilla puede no tenerlas.
 */
export class Usuario {
  /**
   * Campo privado de JavaScript (#): `console.log` o `util.inspect` no lo
   * muestran, así el hash no aparece por accidente en un log (RNF-02).
   */
  readonly #propiedades: PropiedadesUsuario;

  private constructor(propiedades: PropiedadesUsuario) {
    if (propiedades.hashClave.length === 0) {
      throw new Error('El usuario debe tener el hash de su clave.');
    }
    if (
      propiedades.rol === 'CLIENTE' &&
      (propiedades.privacidadAceptadaEn === null ||
        propiedades.versionPrivacidad === null)
    ) {
      throw new ReglaNegocioError(
        'PRIVACIDAD_NO_ACEPTADA',
        'Debe aceptar el aviso de privacidad para crear la cuenta.',
      );
    }
    this.#propiedades = propiedades;
  }

  /** Cliente nuevo: acepta el aviso de privacidad vigente en el momento del registro. */
  static crearCliente(datos: DatosNuevoCliente): Usuario {
    return new Usuario({
      id: datos.id,
      nombre: datos.nombre,
      correo: datos.correo,
      telefono: datos.telefono,
      hashClave: datos.hashClave,
      rol: 'CLIENTE',
      activo: true,
      privacidadAceptadaEn: datos.ahora,
      versionPrivacidad: datos.versionPrivacidad,
      creadoEn: datos.ahora,
      actualizadoEn: datos.ahora,
    });
  }

  /**
   * Vendedor creado por el comando semilla (D-07, PA-09). No pasa por el
   * registro público, así que no tiene aceptación del aviso de privacidad.
   */
  static crearVendedor(datos: DatosNuevoVendedor): Usuario {
    return new Usuario({
      id: datos.id,
      nombre: datos.nombre,
      correo: datos.correo,
      telefono: datos.telefono,
      hashClave: datos.hashClave,
      rol: 'VENDEDOR',
      activo: true,
      privacidadAceptadaEn: null,
      versionPrivacidad: null,
      creadoEn: datos.ahora,
      actualizadoEn: datos.ahora,
    });
  }

  /** Reconstruye un usuario ya guardado (lo usa la capa de persistencia). */
  static reconstituir(propiedades: PropiedadesUsuario): Usuario {
    return new Usuario({ ...propiedades });
  }

  get id(): string {
    return this.#propiedades.id;
  }

  get nombre(): NombreUsuario {
    return this.#propiedades.nombre;
  }

  get correo(): Correo {
    return this.#propiedades.correo;
  }

  get telefono(): Telefono {
    return this.#propiedades.telefono;
  }

  get hashClave(): string {
    return this.#propiedades.hashClave;
  }

  get rol(): Rol {
    return this.#propiedades.rol;
  }

  get activo(): boolean {
    return this.#propiedades.activo;
  }

  get privacidadAceptadaEn(): Date | null {
    return this.#propiedades.privacidadAceptadaEn;
  }

  get versionPrivacidad(): string | null {
    return this.#propiedades.versionPrivacidad;
  }

  get creadoEn(): Date {
    return this.#propiedades.creadoEn;
  }

  get actualizadoEn(): Date {
    return this.#propiedades.actualizadoEn;
  }

  esVendedor(): boolean {
    return this.#propiedades.rol === 'VENDEDOR';
  }

  esCliente(): boolean {
    return this.#propiedades.rol === 'CLIENTE';
  }

  /** Datos que se pueden mostrar o devolver por la API. */
  aPublico(): UsuarioPublico {
    return {
      id: this.id,
      nombre: this.nombre.valor,
      correo: this.correo.valor,
      telefono: this.telefono.valor,
      rol: this.rol,
      privacidadAceptadaEn: this.privacidadAceptadaEn,
      versionPrivacidad: this.versionPrivacidad,
      creadoEn: this.creadoEn,
    };
  }

  /**
   * Si el usuario se serializa por error (log, respuesta), sale sin el hash
   * de la clave (RNF-02).
   */
  toJSON(): UsuarioPublico {
    return this.aPublico();
  }
}
