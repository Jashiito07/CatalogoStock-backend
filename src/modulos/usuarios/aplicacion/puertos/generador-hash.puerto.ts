/**
 * Puerto para el hash adaptativo de claves (RNF-02, D-08).
 * El adaptador de infraestructura usa bcrypt con costo 12.
 */
export interface GeneradorHash {
  /** Devuelve el hash de `clave`, con su sal incluida. Nunca devuelve la clave. */
  generar(clave: string): Promise<string>;
  /** `true` si `clave` corresponde a `hash`. No lanza errores con hashes mal formados. */
  comparar(clave: string, hash: string): Promise<boolean>;
}

export const GENERADOR_HASH = Symbol('GENERADOR_HASH');
