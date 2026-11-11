import { ReglaNegocioError } from '../../../compartido/dominio/errores.js';

/**
 * Código de recuperación de clave (RF-USU-05, D-35, D-39; contrato de
 * recuperación de clave, «Reglas del código de recuperación»). TypeScript
 * puro: la generación aleatoria, el HMAC y la comparación en tiempo constante
 * viven en el adaptador `ProtectorCodigoRecuperacion` (infraestructura).
 */

/** 6 dígitos, de `000000` a `999999`. */
export const DIGITOS_CODIGO_RECUPERACION = 6;
/** Cantidad de códigos distintos posibles (10^6). */
export const CODIGOS_POSIBLES = 10 ** DIGITOS_CODIGO_RECUPERACION;
/** Vigencia: 15 minutos desde que se genera. */
export const VIGENCIA_CODIGO_MINUTOS = 15;
/** Al quinto intento fallido el código queda invalidado. */
export const INTENTOS_MAXIMOS_CODIGO = 5;

const PATRON_CODIGO = /^\d{6}$/;
const MILISEGUNDOS_POR_MINUTO = 60 * 1000;

export const MENSAJE_CODIGO_FORMATO = 'El código debe tener 6 dígitos.';
export const MENSAJE_CODIGO_INVALIDO =
  'El código no es válido o ya venció. Pide uno nuevo a tu vendedor.';

/** `true` si el texto tiene exactamente 6 dígitos ASCII. */
export function esFormatoCodigoRecuperacion(valor: unknown): valor is string {
  return typeof valor === 'string' && PATRON_CODIGO.test(valor);
}

/**
 * Convierte un entero aleatorio de `[0, 10^6)` en el código de 6 dígitos con
 * ceros a la izquierda (`7` → `000007`).
 */
export function formatearCodigoRecuperacion(numero: number): string {
  if (!Number.isInteger(numero) || numero < 0 || numero >= CODIGOS_POSIBLES) {
    throw new Error('El número del código debe estar entre 0 y 999999.');
  }
  return String(numero).padStart(DIGITOS_CODIGO_RECUPERACION, '0');
}

/** Vencimiento de un código generado en `ahora`. */
export function calcularVencimientoCodigo(ahora: Date): Date {
  return new Date(
    ahora.getTime() + VIGENCIA_CODIGO_MINUTOS * MILISEGUNDOS_POR_MINUTO,
  );
}

/**
 * Motivo interno de una recuperación fallida (contrato de auditoría,
 * `RECUPERACION_FALLIDA`, D-20). Solo va a la bitácora; **nunca** a la respuesta.
 * - `NO_CLIENTE`: el correo no existe, es del Vendedor o la cuenta está inactiva.
 * - `SIN_CODIGO`: el Cliente no tiene un código pendiente (nunca se generó,
 *   ya se usó o se invalidó al generar otro).
 * - `VENCIDO`: pasaron los 15 minutos.
 * - `AGOTADO`: se invalidó por 5 intentos fallidos.
 * - `CODIGO_INCORRECTO`: el código no coincide (suma un intento).
 */
export type MotivoRecuperacionFallida =
  'NO_CLIENTE' | 'SIN_CODIGO' | 'VENCIDO' | 'AGOTADO' | 'CODIGO_INCORRECTO';

/**
 * 422 `CODIGO_INVALIDO`: mensaje único para todos los casos, para no revelar
 * si el correo existe ni por qué falló (contrato de recuperación de clave).
 * El motivo queda solo en la bitácora.
 */
export class CodigoRecuperacionInvalidoError extends ReglaNegocioError {
  constructor(readonly motivo: MotivoRecuperacionFallida) {
    super('CODIGO_INVALIDO', MENSAJE_CODIGO_INVALIDO);
  }
}

export type EstadoCodigoRecuperacion =
  'VIGENTE' | 'USADO' | 'AGOTADO' | 'INVALIDADO' | 'VENCIDO';

export interface PropiedadesCodigoRecuperacion {
  id: string;
  /** Cliente al que pertenece. */
  idUsuario: string;
  /** HMAC-SHA256 del código con `RECUPERACION_SECRETO`; nunca el código. */
  hashCodigo: string;
  /** Vendedor que lo generó. */
  generadoPor: string;
  creadoEn: Date;
  venceEn: Date;
  usadoEn: Date | null;
  invalidadoEn: Date | null;
  intentosFallidos: number;
}

export interface DatosNuevoCodigoRecuperacion {
  id: string;
  idUsuario: string;
  hashCodigo: string;
  generadoPor: string;
  ahora: Date;
}

/** Se intentó usar o cambiar un código que no está vigente. */
export class CodigoNoVigenteError extends Error {
  constructor(readonly estado: Exclude<EstadoCodigoRecuperacion, 'VIGENTE'>) {
    super(`El código de recuperación no está vigente (${estado}).`);
    this.name = 'CodigoNoVigenteError';
  }
}

/**
 * Entidad del código de recuperación.
 *
 * Reglas (D-39):
 * - Vence 15 minutos después de generarse.
 * - Se usa una sola vez.
 * - Cada intento fallido suma 1; al quinto queda invalidado (`AGOTADO`),
 *   aunque después se envíe el código correcto.
 * - Generar uno nuevo invalida el anterior (`INVALIDADO`): el repositorio lo
 *   garantiza con un índice único parcial (uno pendiente por Cliente).
 * - Uso, agotamiento e invalidación tienen prioridad sobre el vencimiento.
 */
export class CodigoRecuperacion {
  readonly #propiedades: PropiedadesCodigoRecuperacion;

  private constructor(propiedades: PropiedadesCodigoRecuperacion) {
    if (propiedades.hashCodigo.length === 0) {
      throw new Error('El código de recuperación debe tener su hash.');
    }
    if (propiedades.venceEn.getTime() <= propiedades.creadoEn.getTime()) {
      throw new Error(
        'El código de recuperación debe vencer después de crearse.',
      );
    }
    if (
      !Number.isInteger(propiedades.intentosFallidos) ||
      propiedades.intentosFallidos < 0 ||
      propiedades.intentosFallidos > INTENTOS_MAXIMOS_CODIGO
    ) {
      throw new Error(
        `Los intentos fallidos deben estar entre 0 y ${INTENTOS_MAXIMOS_CODIGO}.`,
      );
    }
    this.#propiedades = propiedades;
  }

  /** Código nuevo, vigente durante 15 minutos. */
  static generar(datos: DatosNuevoCodigoRecuperacion): CodigoRecuperacion {
    return new CodigoRecuperacion({
      id: datos.id,
      idUsuario: datos.idUsuario,
      hashCodigo: datos.hashCodigo,
      generadoPor: datos.generadoPor,
      creadoEn: datos.ahora,
      venceEn: calcularVencimientoCodigo(datos.ahora),
      usadoEn: null,
      invalidadoEn: null,
      intentosFallidos: 0,
    });
  }

  /** Reconstruye un código guardado (capa de persistencia). */
  static reconstituir(
    propiedades: PropiedadesCodigoRecuperacion,
  ): CodigoRecuperacion {
    return new CodigoRecuperacion({ ...propiedades });
  }

  get id(): string {
    return this.#propiedades.id;
  }

  get idUsuario(): string {
    return this.#propiedades.idUsuario;
  }

  get hashCodigo(): string {
    return this.#propiedades.hashCodigo;
  }

  get generadoPor(): string {
    return this.#propiedades.generadoPor;
  }

  get creadoEn(): Date {
    return this.#propiedades.creadoEn;
  }

  get venceEn(): Date {
    return this.#propiedades.venceEn;
  }

  get usadoEn(): Date | null {
    return this.#propiedades.usadoEn;
  }

  get invalidadoEn(): Date | null {
    return this.#propiedades.invalidadoEn;
  }

  get intentosFallidos(): number {
    return this.#propiedades.intentosFallidos;
  }

  estadoEn(ahora: Date): EstadoCodigoRecuperacion {
    if (this.#propiedades.usadoEn !== null) {
      return 'USADO';
    }
    if (this.#propiedades.intentosFallidos >= INTENTOS_MAXIMOS_CODIGO) {
      return 'AGOTADO';
    }
    if (this.#propiedades.invalidadoEn !== null) {
      return 'INVALIDADO';
    }
    return ahora.getTime() < this.#propiedades.venceEn.getTime()
      ? 'VIGENTE'
      : 'VENCIDO';
  }

  /**
   * Motivo de bitácora cuando el código no está vigente: un código usado o
   * reemplazado por otro equivale a «sin código».
   */
  motivoSiNoVigente(ahora: Date): MotivoRecuperacionFallida | null {
    switch (this.estadoEn(ahora)) {
      case 'VIGENTE':
        return null;
      case 'VENCIDO':
        return 'VENCIDO';
      case 'AGOTADO':
        return 'AGOTADO';
      case 'USADO':
      case 'INVALIDADO':
        return 'SIN_CODIGO';
    }
  }

  /**
   * Suma un intento fallido. Al llegar a 5 el código queda invalidado.
   * Solo se cuenta sobre un código vigente.
   */
  registrarIntentoFallido(ahora: Date): void {
    this.exigirVigente(ahora);
    this.#propiedades.intentosFallidos += 1;
    if (this.#propiedades.intentosFallidos >= INTENTOS_MAXIMOS_CODIGO) {
      this.#propiedades.invalidadoEn = ahora;
    }
  }

  /** Marca el código como usado: no vuelve a servir. */
  marcarUsado(ahora: Date): void {
    this.exigirVigente(ahora);
    this.#propiedades.usadoEn = ahora;
  }

  /** Vigencia que se muestra al Vendedor (`codigoRecuperacionVigenteHasta`). */
  vigenteHasta(ahora: Date): Date | null {
    return this.estadoEn(ahora) === 'VIGENTE'
      ? this.#propiedades.venceEn
      : null;
  }

  private exigirVigente(ahora: Date): void {
    const estado = this.estadoEn(ahora);
    if (estado !== 'VIGENTE') {
      throw new CodigoNoVigenteError(estado);
    }
  }

  /** Si se serializa por error (log, respuesta), sale sin el hash. */
  toJSON(): Omit<PropiedadesCodigoRecuperacion, 'hashCodigo'> {
    const { hashCodigo: _hash, ...resto } = this.#propiedades;
    return { ...resto };
  }
}
