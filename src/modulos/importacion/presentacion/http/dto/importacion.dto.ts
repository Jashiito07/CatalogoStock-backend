import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  aEnteroDeConsulta,
  PaginacionDto,
} from '../../../../../compartido/presentacion/paginacion.dto.js';
import { CumpleReglaDominio } from '../../../../../compartido/presentacion/regla-dominio.js';
import {
  MENSAJE_BUSQUEDA_INVALIDA,
  MENSAJE_DESCRIPCION_INVALIDA,
  MENSAJE_DISPONIBILIDAD_INVALIDA,
  MENSAJE_MARCA_ID_INVALIDO,
  MENSAJE_NOMBRE_INVALIDO,
  MENSAJE_PRECIO_INVALIDO,
  validarBusqueda,
  validarDescripcion,
  validarDisponibilidad,
  validarNombreProducto,
  validarPrecio,
} from '../../../../productos/validaciones.js';
import {
  ACCIONES_REVISION,
  esAccionRevision,
} from '../../../dominio/accion-revision.js';
import { ESTADOS_BORRADOR, esEstadoBorrador } from '../../../dominio/borrador.js';
import {
  ESTADOS_IMPORTACION,
  esEstadoImportacion,
} from '../../../dominio/importacion.js';

const presente = (_objeto: unknown, valor: unknown): boolean =>
  valor !== undefined;

export const MENSAJE_ESTADO_INVALIDO = `El estado debe ser ${ESTADOS_BORRADOR.join(', ')}.`;
export const MENSAJE_ESTADO_IMPORTACION_INVALIDO = `El estado debe ser ${ESTADOS_IMPORTACION.join(' o ')}.`;
export const MENSAJE_ACCION_INVALIDA = `La acción debe ser ${ACCIONES_REVISION.join(', ')}.`;
export const MENSAJE_PAGINA_PDF_INVALIDA =
  'La página del PDF debe ser un número entero mayor o igual a 1.';
export const MENSAJE_CON_ADVERTENCIAS_INVALIDO =
  'conAdvertencias debe ser true o false.';
export const MENSAJE_IDS_INVALIDOS =
  'ids debe ser una lista de 1 a 100 identificadores (UUID).';

/** Campo de texto del `multipart/form-data` de `POST /productos/importaciones` (junto con el archivo). */
export class CrearImportacionDto {
  @IsUUID(undefined, { message: MENSAJE_MARCA_ID_INVALIDO })
  marcaId: string;
}

/**
 * Parámetros de `GET /productos/importaciones/{id}/borradores`: paginación del
 * README más `estado`, `conAdvertencias`, `busqueda` y `paginaPdf`.
 */
export class ConsultaBorradoresDto extends PaginacionDto {
  @ValidateIf(presente)
  @CumpleReglaDominio(
    (valor) => {
      if (!esEstadoBorrador(valor)) {
        throw new Error(MENSAJE_ESTADO_INVALIDO);
      }
      return valor;
    },
    MENSAJE_ESTADO_INVALIDO,
  )
  estado?: string;

  @ValidateIf(presente)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: MENSAJE_CON_ADVERTENCIAS_INVALIDO })
  conAdvertencias?: boolean;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarBusqueda, MENSAJE_BUSQUEDA_INVALIDA)
  busqueda?: string;

  @ValidateIf(presente)
  @Transform(aEnteroDeConsulta)
  @IsInt({ message: MENSAJE_PAGINA_PDF_INVALIDA })
  @Min(1, { message: MENSAJE_PAGINA_PDF_INVALIDA })
  paginaPdf?: number;

  /** D-57: `ACTUALIZAR`, `NUEVO` o `CAMBIO_PRECIO`. */
  @ValidateIf(presente)
  @CumpleReglaDominio((valor) => {
    if (!esAccionRevision(valor)) {
      throw new Error(MENSAJE_ACCION_INVALIDA);
    }
    return valor;
  }, MENSAJE_ACCION_INVALIDA)
  accion?: string;
}

/**
 * Cuerpo parcial de `PATCH /productos/importaciones/borradores/{id}`: las
 * mismas validaciones que `POST /productos`; ningún campo admite `null` y uno
 * no declarado responde 400.
 */
export class EditarBorradorDto {
  @ValidateIf(presente)
  @CumpleReglaDominio(validarNombreProducto, MENSAJE_NOMBRE_INVALIDO)
  nombre?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarDescripcion, MENSAJE_DESCRIPCION_INVALIDA)
  descripcion?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarPrecio, MENSAJE_PRECIO_INVALIDO)
  precio?: string;

  @ValidateIf(presente)
  @IsUUID(undefined, { message: MENSAJE_MARCA_ID_INVALIDO })
  marcaId?: string;

  @ValidateIf(presente)
  @CumpleReglaDominio(validarDisponibilidad, MENSAJE_DISPONIBILIDAD_INVALIDA)
  disponibilidad?: string;
}

/** Cuerpo de `aprobar` y `descartar`: de 1 a 100 ids de borrador. */
export class IdsBorradoresDto {
  @IsArray({ message: MENSAJE_IDS_INVALIDOS })
  @ArrayMinSize(1, { message: MENSAJE_IDS_INVALIDOS })
  @ArrayMaxSize(100, { message: MENSAJE_IDS_INVALIDOS })
  @IsUUID(undefined, { each: true, message: MENSAJE_IDS_INVALIDOS })
  ids: string[];
}

/**
 * Parámetros de GET /productos/importaciones (D-57): paginación del README
 * más estado (VIGENTE o ARCHIVADA) y marcaId.
 */
export class ConsultaImportacionesDto extends PaginacionDto {
  @ValidateIf(presente)
  @CumpleReglaDominio(
    (valor) => {
      if (!esEstadoImportacion(valor)) {
        throw new Error(MENSAJE_ESTADO_IMPORTACION_INVALIDO);
      }
      return valor;
    },
    MENSAJE_ESTADO_IMPORTACION_INVALIDO,
  )
  estado?: string;

  @ValidateIf(presente)
  @IsUUID(undefined, { message: MENSAJE_MARCA_ID_INVALIDO })
  marcaId?: string;
}