import { DatosInvalidosError } from './errores.js';

/**
 * Texto decimal no negativo con hasta 2 decimales: "12", "12.5", "12.50".
 * Hasta 10 dígitos enteros, igual que `numeric(12,2)` y la validación de DTOs.
 */
const FORMATO_DECIMAL = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

/**
 * Objeto de valor para dinero exacto (backend-typeorm, contrato de API).
 *
 * Se representa en centavos con `bigint`, nunca con `number` de punto
 * flotante. En la API y en PostgreSQL (`numeric(12,2)`) viaja como texto
 * decimal con 2 decimales ("12.50"). No admite montos negativos.
 */
export class Dinero {
  private constructor(private readonly centavos: bigint) {}

  static readonly CERO = new Dinero(0n);

  /** Crea un monto desde texto decimal ("12.50"). Rechaza negativos y más de 2 decimales. */
  static desdeTexto(valor: string): Dinero {
    const coincidencia = FORMATO_DECIMAL.exec(valor);
    if (!coincidencia) {
      throw new DatosInvalidosError(
        'El monto debe ser un número decimal no negativo con hasta 2 decimales.',
        { valor },
      );
    }
    const enteros = BigInt(coincidencia[1]);
    const decimales = BigInt((coincidencia[2] ?? '').padEnd(2, '0'));
    return new Dinero(enteros * 100n + decimales);
  }

  /** Crea un monto desde centavos enteros no negativos. */
  static desdeCentavos(centavos: bigint): Dinero {
    if (centavos < 0n) {
      throw new DatosInvalidosError('El monto no puede ser negativo.');
    }
    return new Dinero(centavos);
  }

  sumar(otro: Dinero): Dinero {
    return new Dinero(this.centavos + otro.centavos);
  }

  /** Multiplica por una cantidad entera no negativa (p. ej. unidades de una línea). */
  multiplicar(cantidad: number): Dinero {
    if (!Number.isSafeInteger(cantidad) || cantidad < 0) {
      throw new DatosInvalidosError(
        'La cantidad debe ser un número entero no negativo.',
        { cantidad },
      );
    }
    return new Dinero(this.centavos * BigInt(cantidad));
  }

  /** -1 si es menor, 0 si es igual, 1 si es mayor que `otro`. */
  comparar(otro: Dinero): -1 | 0 | 1 {
    if (this.centavos < otro.centavos) return -1;
    if (this.centavos > otro.centavos) return 1;
    return 0;
  }

  esIgualA(otro: Dinero): boolean {
    return this.comparar(otro) === 0;
  }

  esMayorQue(otro: Dinero): boolean {
    return this.comparar(otro) === 1;
  }

  esMenorQue(otro: Dinero): boolean {
    return this.comparar(otro) === -1;
  }

  enCentavos(): bigint {
    return this.centavos;
  }

  /** Texto decimal con exactamente 2 decimales: "0.30". */
  aTexto(): string {
    const enteros = this.centavos / 100n;
    const decimales = (this.centavos % 100n).toString().padStart(2, '0');
    return `${enteros.toString()}.${decimales}`;
  }

  toString(): string {
    return this.aTexto();
  }

  /** Al serializar a JSON se envía como texto, nunca como número. */
  toJSON(): string {
    return this.aTexto();
  }
}
