/**
 * Puerto del token de renovación (D-09, contrato de usuarios): valor opaco y
 * aleatorio de 256 bits. El servidor guarda solo su hash.
 */
export interface GeneradorTokenRenovacion {
  generar(): string;
  /** Hash determinista para buscar el token sin guardarlo. */
  calcularHash(token: string): string;
}

export const GENERADOR_TOKEN_RENOVACION = Symbol('GENERADOR_TOKEN_RENOVACION');
