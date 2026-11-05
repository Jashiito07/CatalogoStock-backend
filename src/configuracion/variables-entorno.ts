import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Variables de entorno obligatorias de la API.
 * Cada variable está documentada en `.env.example` con valores falsos.
 * Si falta una o no es válida, la aplicación no arranca (backend-seguridad).
 *
 * Se usa `@Type(() => Number)` explícito para no depender de los metadatos
 * de decoradores (Vitest no los emite).
 */
export class VariablesEntorno {
  @Type(() => Number)
  @IsInt({ message: 'PUERTO debe ser un número entero' })
  @Min(1)
  @Max(65535)
  PUERTO!: number;

  /** Orígenes permitidos por CORS, separados por comas. */
  @IsString()
  @IsNotEmpty({ message: 'CORS_ORIGENES es obligatoria' })
  CORS_ORIGENES!: string;

  @IsString()
  @IsNotEmpty({ message: 'BD_HOST es obligatoria' })
  BD_HOST!: string;

  @Type(() => Number)
  @IsInt({ message: 'BD_PUERTO debe ser un número entero' })
  @Min(1)
  @Max(65535)
  BD_PUERTO!: number;

  @IsString()
  @IsNotEmpty({ message: 'BD_NOMBRE es obligatoria' })
  BD_NOMBRE!: string;

  @IsString()
  @IsNotEmpty({ message: 'BD_USUARIO es obligatoria' })
  BD_USUARIO!: string;

  @IsString()
  @IsNotEmpty({ message: 'BD_CLAVE es obligatoria' })
  BD_CLAVE!: string;
}

/**
 * Valida las variables de entorno al arrancar. El error solo nombra las
 * variables con problemas, nunca sus valores (no se exponen secretos).
 */
export function validarVariablesEntorno(
  configuracion: Record<string, unknown>,
): VariablesEntorno {
  const variables = plainToInstance(VariablesEntorno, configuracion);
  const errores = validateSync(variables, { skipMissingProperties: false });
  if (errores.length > 0) {
    const nombres = errores.map((error) => error.property).join(', ');
    throw new Error(
      `Configuración inválida: revise las variables de entorno ${nombres} (ver .env.example).`,
    );
  }
  return variables;
}

/** Convierte CORS_ORIGENES ("a,b , c") en una lista sin espacios ni vacíos. */
export function obtenerOrigenesCors(valor: string): string[] {
  return valor
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);
}
