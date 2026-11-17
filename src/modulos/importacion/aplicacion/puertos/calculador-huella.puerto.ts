/**
 * Puerto que calcula la huella de un archivo: SHA-256 en hexadecimal (64
 * caracteres en minúsculas). El PDF no se guarda; solo se conserva esta huella
 * para no procesar dos veces el mismo archivo.
 */
export interface CalculadorHuella {
  calcular(contenido: Uint8Array): string;
}

export const CALCULADOR_HUELLA = Symbol('CALCULADOR_HUELLA');
