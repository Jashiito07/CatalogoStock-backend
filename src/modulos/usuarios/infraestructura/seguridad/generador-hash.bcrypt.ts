import bcrypt from 'bcrypt';
import type { GeneradorHash } from '../../aplicacion/puertos/generador-hash.puerto.js';

/** Costo de bcrypt aprobado (D-08, contrato de usuarios: `BCRYPT_COSTO=12`). */
export const COSTO_BCRYPT_POR_DEFECTO = 12;

/**
 * Adaptador bcrypt del puerto GeneradorHash (RNF-02, D-08).
 * Cada hash lleva su propia sal y el costo dentro del texto (`$2b$12$…`).
 */
export class GeneradorHashBcrypt implements GeneradorHash {
  constructor(private readonly costo: number = COSTO_BCRYPT_POR_DEFECTO) {
    if (!Number.isInteger(costo) || costo < 4 || costo > 31) {
      throw new Error('El costo de bcrypt debe ser un entero entre 4 y 31.');
    }
  }

  generar(clave: string): Promise<string> {
    return bcrypt.hash(clave, this.costo);
  }

  async comparar(clave: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(clave, hash);
    } catch {
      // Hash mal formado: se trata como clave incorrecta, sin exponer el motivo.
      return false;
    }
  }
}
