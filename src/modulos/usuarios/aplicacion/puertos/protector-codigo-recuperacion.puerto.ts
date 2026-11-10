/**
 * Puerto criptográfico del código de recuperación (RF-USU-05, D-35). El
 * adaptador usa `node:crypto`: `randomInt` para generar, HMAC-SHA256 con
 * `RECUPERACION_SECRETO` para el hash y `timingSafeEqual` para comparar.
 */
export interface ProtectorCodigoRecuperacion {
  /** Código nuevo de 6 dígitos con un generador criptográfico. */
  generar(): string;
  /** Hash que se guarda (64 caracteres hexadecimales). Nunca el código. */
  calcularHash(codigo: string): string;
  /** `true` si `codigo` corresponde a `hash`, comparando en tiempo constante. */
  coincide(codigo: string, hash: string): boolean;
}

export const PROTECTOR_CODIGO_RECUPERACION = Symbol(
  'PROTECTOR_CODIGO_RECUPERACION',
);
