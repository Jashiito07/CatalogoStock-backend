import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { ProtectorCodigoRecuperacion } from '../../aplicacion/puertos/protector-codigo-recuperacion.puerto.js';
import {
  CODIGOS_POSIBLES,
  formatearCodigoRecuperacion,
} from '../../dominio/codigo-recuperacion.js';

/** Un hash válido: SHA-256 en hexadecimal (64 caracteres). */
const PATRON_HASH = /^[0-9a-f]{64}$/;

/**
 * Adaptador `node:crypto` del código de recuperación (RF-USU-05, D-35), sin
 * dependencias extra.
 *
 * - `generar`: `randomInt` (generador criptográfico, sin sesgo de módulo)
 *   entre 000000 y 999999.
 * - `calcularHash`: HMAC-SHA256 con `RECUPERACION_SECRETO`. Con solo 10^6
 *   códigos posibles, un SHA-256 sin secreto se revertiría probándolos todos;
 *   con el secreto, el hash guardado no sirve sin el servidor.
 * - `coincide`: compara los dos hash con `timingSafeEqual` (tiempo constante).
 */
export class ProtectorCodigoRecuperacionCrypto implements ProtectorCodigoRecuperacion {
  readonly #secreto: string;

  constructor(secreto: string) {
    if (secreto.length === 0) {
      throw new Error('Falta el secreto de los códigos de recuperación.');
    }
    this.#secreto = secreto;
  }

  generar(): string {
    return formatearCodigoRecuperacion(randomInt(0, CODIGOS_POSIBLES));
  }

  calcularHash(codigo: string): string {
    return createHmac('sha256', this.#secreto)
      .update(codigo, 'utf8')
      .digest('hex');
  }

  coincide(codigo: string, hash: string): boolean {
    if (!PATRON_HASH.test(hash)) {
      return false;
    }
    return timingSafeEqual(
      Buffer.from(this.calcularHash(codigo), 'hex'),
      Buffer.from(hash, 'hex'),
    );
  }

  /** Evita que el secreto aparezca si el objeto se serializa por error. */
  toJSON(): Record<string, never> {
    return {};
  }
}
