import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/** Costo de bcrypt por defecto (D-08, contrato de usuarios). */
export const COSTO_BCRYPT = 12;

/** Vida del token de acceso por defecto: 15 minutos (D-09). */
export const VIDA_ACCESO_SEGUNDOS = 900;

/** Vida del token de renovación por defecto: 7 días (D-09). */
export const VIDA_RENOVACION_DIAS = 7;

/** Longitud mínima de JWT_SECRETO (contrato de usuarios). */
export const LONGITUD_MINIMA_JWT_SECRETO = 32;

/** Longitud mínima de RECUPERACION_SECRETO (contrato de recuperación de clave). */
export const LONGITUD_MINIMA_RECUPERACION_SECRETO = 32;

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

  /**
   * Costo de bcrypt para el hash de las claves (D-08, contrato de usuarios).
   * Opcional: si no se define vale 12. Se limita a 10–14 para que un error de
   * configuración no debilite el hash ni vuelva lentísimo el ingreso.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'BCRYPT_COSTO debe ser un número entero' })
  @Min(10)
  @Max(14)
  BCRYPT_COSTO: number = COSTO_BCRYPT;

  /**
   * Secreto con el que se firman los tokens de acceso (JWT HS256, D-08, D-09).
   * Obligatorio y de al menos 32 caracteres aleatorios (contrato de usuarios).
   */
  @IsString()
  @MinLength(LONGITUD_MINIMA_JWT_SECRETO, {
    message: `JWT_SECRETO debe tener al menos ${LONGITUD_MINIMA_JWT_SECRETO} caracteres`,
  })
  JWT_SECRETO!: string;

  /**
   * Secreto del HMAC-SHA256 con el que se guarda el hash de los códigos de
   * recuperación (RF-USU-05, D-35). Obligatorio y de al menos 32 caracteres
   * aleatorios. Si cambia, los códigos vigentes dejan de servir.
   */
  @IsString()
  @MinLength(LONGITUD_MINIMA_RECUPERACION_SECRETO, {
    message: `RECUPERACION_SECRETO debe tener al menos ${LONGITUD_MINIMA_RECUPERACION_SECRETO} caracteres`,
  })
  RECUPERACION_SECRETO!: string;

  /**
   * Vida del token de acceso en segundos (D-09: 15 minutos).
   * Opcional: si no se define vale 900. Se limita a 1–60 minutos.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'JWT_VIDA_ACCESO_SEGUNDOS debe ser un número entero' })
  @Min(60)
  @Max(3600)
  JWT_VIDA_ACCESO_SEGUNDOS: number = VIDA_ACCESO_SEGUNDOS;

  /**
   * Vida del token de renovación en días (D-09: 7 días).
   * Opcional: si no se define vale 7. Se limita a 1–30 días.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'RENOVACION_VIDA_DIAS debe ser un número entero' })
  @Min(1)
  @Max(30)
  RENOVACION_VIDA_DIAS: number = VIDA_RENOVACION_DIAS;

  /**
   * Número de proxies de confianza delante de la API (`trust proxy` de
   * Express). Con 0 (por defecto) se usa la IP de la conexión y se ignora
   * `X-Forwarded-For`, para que nadie evite el límite de intentos (D-17)
   * falseando esa cabecera. En producción, detrás de un proxy TLS, vale 1.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'PROXY_SALTOS_CONFIABLES debe ser un número entero' })
  @Min(0)
  @Max(5)
  PROXY_SALTOS_CONFIABLES: number = 0;
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
