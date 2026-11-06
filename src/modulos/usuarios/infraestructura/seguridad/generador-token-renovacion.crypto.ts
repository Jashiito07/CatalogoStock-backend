import { createHash, randomBytes } from 'node:crypto';
import type { GeneradorTokenRenovacion } from '../../aplicacion/puertos/generador-token-renovacion.puerto.js';

/** 256 bits de entropía (contrato de usuarios). */
export const BYTES_TOKEN_RENOVACION = 32;

/**
 * Token de renovación opaco con `node:crypto` (D-09), sin dependencias extra.
 *
 * - `generar`: 32 bytes aleatorios en base64url (43 caracteres).
 * - `calcularHash`: SHA-256 en hexadecimal. Basta un hash rápido porque el
 *   token es aleatorio y de 256 bits (no se puede adivinar por fuerza bruta,
 *   a diferencia de una clave elegida por una persona).
 */
export class GeneradorTokenRenovacionCrypto implements GeneradorTokenRenovacion {
  generar(): string {
    return randomBytes(BYTES_TOKEN_RENOVACION).toString('base64url');
  }

  calcularHash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
