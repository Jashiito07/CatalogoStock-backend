import { createHash } from 'node:crypto';
import type { CalculadorHuella } from '../../aplicacion/puertos/calculador-huella.puerto.js';

/** SHA-256 en hexadecimal (64 caracteres en minúsculas) con `node:crypto`. */
export class CalculadorHuellaSha256 implements CalculadorHuella {
  calcular(contenido: Uint8Array): string {
    return createHash('sha256').update(contenido).digest('hex');
  }
}
