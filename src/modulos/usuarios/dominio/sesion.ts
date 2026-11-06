import type { Canal } from './canal.js';

/**
 * Motivo por el que un token de renovación dejó de servir (D-09).
 * - `ROTADA`: se usó para renovar y se emitió otro en su lugar.
 * - `CERRADA`: el usuario cerró la sesión (`/autenticacion/salida`).
 * - `REUTILIZACION`: alguien presentó un token ya rotado y se revocó toda la familia.
 */
export const MOTIVOS_REVOCACION = [
  'ROTADA',
  'CERRADA',
  'REUTILIZACION',
] as const;

export type MotivoRevocacion = (typeof MOTIVOS_REVOCACION)[number];

export type EstadoSesion = 'VIGENTE' | 'VENCIDA' | 'REVOCADA';

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export interface PropiedadesSesion {
  id: string;
  idUsuario: string;
  /** Cadena de rotación: todas las sesiones que nacen de un mismo ingreso. */
  familia: string;
  canal: Canal;
  /** Hash del token de renovación. El token nunca se guarda (D-09). */
  hashToken: string;
  creadaEn: Date;
  venceEn: Date;
  revocadaEn: Date | null;
  motivoRevocacion: MotivoRevocacion | null;
}

export interface DatosNuevaSesion {
  id: string;
  idUsuario: string;
  familia: string;
  canal: Canal;
  hashToken: string;
  ahora: Date;
  /** Vida del token de renovación en días (D-09: 7). */
  vidaDias: number;
}

export interface DatosSesionSiguiente {
  id: string;
  hashToken: string;
  ahora: Date;
  vidaDias: number;
}

/** Se intentó rotar una sesión vencida o revocada. */
export class SesionNoVigenteError extends Error {
  constructor(readonly estado: Exclude<EstadoSesion, 'VIGENTE'>) {
    super(`La sesión no está vigente (${estado}).`);
    this.name = 'SesionNoVigenteError';
  }
}

function calcularVencimiento(ahora: Date, vidaDias: number): Date {
  if (!Number.isInteger(vidaDias) || vidaDias <= 0) {
    throw new Error(
      'La vida del token de renovación debe ser un entero positivo de días.',
    );
  }
  return new Date(ahora.getTime() + vidaDias * MILISEGUNDOS_POR_DIA);
}

/**
 * Sesión de un usuario respaldada por un token de renovación (D-09, RF-USU-01).
 * TypeScript puro, sin TypeORM ni NestJS.
 *
 * Reglas:
 * - El token de renovación vence `vidaDias` después de emitido; cada token
 *   nuevo de la rotación vence a su vez `vidaDias` después de su emisión.
 * - Cada token sirve una sola vez: al renovar, la sesión queda `ROTADA` y
 *   nace otra de la misma familia, con el mismo usuario y el mismo canal.
 * - Una sesión revocada no vuelve a estar vigente.
 */
export class Sesion {
  readonly #propiedades: PropiedadesSesion;

  private constructor(propiedades: PropiedadesSesion) {
    if (propiedades.hashToken.length === 0) {
      throw new Error('La sesión debe tener el hash de su token.');
    }
    if (propiedades.venceEn.getTime() <= propiedades.creadaEn.getTime()) {
      throw new Error('La sesión debe vencer después de crearse.');
    }
    if (
      (propiedades.revocadaEn === null) !==
      (propiedades.motivoRevocacion === null)
    ) {
      throw new Error('La fecha y el motivo de revocación van juntos.');
    }
    this.#propiedades = propiedades;
  }

  /** Sesión nueva al iniciar sesión: abre una familia de rotación. */
  static iniciar(datos: DatosNuevaSesion): Sesion {
    return new Sesion({
      id: datos.id,
      idUsuario: datos.idUsuario,
      familia: datos.familia,
      canal: datos.canal,
      hashToken: datos.hashToken,
      creadaEn: datos.ahora,
      venceEn: calcularVencimiento(datos.ahora, datos.vidaDias),
      revocadaEn: null,
      motivoRevocacion: null,
    });
  }

  /** Reconstruye una sesión guardada (capa de persistencia). */
  static reconstituir(propiedades: PropiedadesSesion): Sesion {
    return new Sesion({ ...propiedades });
  }

  get id(): string {
    return this.#propiedades.id;
  }

  get idUsuario(): string {
    return this.#propiedades.idUsuario;
  }

  get familia(): string {
    return this.#propiedades.familia;
  }

  get canal(): Canal {
    return this.#propiedades.canal;
  }

  get hashToken(): string {
    return this.#propiedades.hashToken;
  }

  get creadaEn(): Date {
    return this.#propiedades.creadaEn;
  }

  get venceEn(): Date {
    return this.#propiedades.venceEn;
  }

  get revocadaEn(): Date | null {
    return this.#propiedades.revocadaEn;
  }

  get motivoRevocacion(): MotivoRevocacion | null {
    return this.#propiedades.motivoRevocacion;
  }

  /** La revocación tiene prioridad sobre el vencimiento. */
  estadoEn(ahora: Date): EstadoSesion {
    if (this.#propiedades.revocadaEn !== null) {
      return 'REVOCADA';
    }
    return ahora.getTime() < this.#propiedades.venceEn.getTime()
      ? 'VIGENTE'
      : 'VENCIDA';
  }

  /**
   * D-09: un token ya rotado que vuelve a llegar indica que pudo ser robado;
   * hay que revocar toda la familia.
   */
  fueRotada(): boolean {
    return this.#propiedades.motivoRevocacion === 'ROTADA';
  }

  perteneceA(idUsuario: string): boolean {
    return this.#propiedades.idUsuario === idUsuario;
  }

  /**
   * Rotación (D-09): revoca esta sesión como `ROTADA` y devuelve la siguiente
   * de la familia, con el mismo usuario y canal. Falla si no está vigente.
   */
  rotar(datos: DatosSesionSiguiente): Sesion {
    const estado = this.estadoEn(datos.ahora);
    if (estado !== 'VIGENTE') {
      throw new SesionNoVigenteError(estado);
    }
    const siguiente = new Sesion({
      id: datos.id,
      idUsuario: this.idUsuario,
      familia: this.familia,
      canal: this.canal,
      hashToken: datos.hashToken,
      creadaEn: datos.ahora,
      venceEn: calcularVencimiento(datos.ahora, datos.vidaDias),
      revocadaEn: null,
      motivoRevocacion: null,
    });
    this.#propiedades.revocadaEn = datos.ahora;
    this.#propiedades.motivoRevocacion = 'ROTADA';
    return siguiente;
  }

  /** Evita que el hash del token aparezca si la sesión se serializa por error. */
  toJSON(): Omit<PropiedadesSesion, 'hashToken'> {
    const { hashToken: _hash, ...resto } = this.#propiedades;
    return { ...resto };
  }
}
