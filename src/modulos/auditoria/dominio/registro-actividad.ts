import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import {
  type AccionAuditoria,
  ENTIDAD_DE_LA_ACCION,
  type EntidadAuditoria,
  esAccionAuditoria,
  esEntidadAuditoria,
} from './catalogo-auditoria.js';
import { type DetalleAuditoria, sanearDetalle } from './detalle-auditoria.js';

const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MENSAJE_REGISTRO_INVALIDO =
  'El registro de la bitácora no es válido.';

export interface DatosRegistroActividad {
  id: string;
  fecha: Date;
  accion: AccionAuditoria;
  idUsuario: string | null;
  entidad: EntidadAuditoria | null;
  idEntidad: string | null;
  detalle: DetalleAuditoria;
}

export interface DatosNuevoRegistro extends Omit<
  DatosRegistroActividad,
  'detalle'
> {
  /** Se sanea antes de guardar (ver `sanearDetalle`). */
  detalle?: Readonly<Record<string, unknown>>;
}

/**
 * Registro de actividad de la bitácora (RF-USU-04, contrato de auditoría).
 * TypeScript puro. Es de solo lectura: una vez creado no cambia.
 *
 * Reglas:
 * - La acción pertenece al catálogo cerrado y la entidad es la que le
 *   corresponde según el contrato (`ACCESO_DENEGADO` no tiene entidad).
 * - `idUsuario` e `idEntidad` son UUID o `null`; sin entidad no hay `idEntidad`.
 * - El detalle nunca contiene datos sensibles (salvo el correo intentado de
 *   `SESION_FALLIDA`, D-20).
 *
 * Un registro inválido es un error de programación de quien llama:
 * `DatosInvalidosError` (dentro de una transacción, la operación se deshace).
 */
export class RegistroActividad {
  private constructor(private readonly datos: DatosRegistroActividad) {}

  /** Crea un registro nuevo y devuelve también los campos descartados del detalle. */
  static crear(datos: DatosNuevoRegistro): {
    registro: RegistroActividad;
    descartados: readonly string[];
  } {
    if (!esAccionAuditoria(datos.accion)) {
      throw RegistroActividad.invalido('accion');
    }
    if (datos.entidad !== null && !esEntidadAuditoria(datos.entidad)) {
      throw RegistroActividad.invalido('entidad');
    }
    if (datos.entidad !== ENTIDAD_DE_LA_ACCION[datos.accion]) {
      throw RegistroActividad.invalido('entidad');
    }
    if (datos.entidad === null && datos.idEntidad !== null) {
      throw RegistroActividad.invalido('idEntidad');
    }
    for (const campo of ['id', 'idUsuario', 'idEntidad'] as const) {
      const valor = datos[campo];
      if (valor !== null && !PATRON_UUID.test(valor)) {
        throw RegistroActividad.invalido(campo);
      }
    }
    if (Number.isNaN(datos.fecha.getTime())) {
      throw RegistroActividad.invalido('fecha');
    }

    const { detalle, descartados } = sanearDetalle(datos.accion, datos.detalle);
    return {
      registro: new RegistroActividad({
        id: datos.id,
        fecha: new Date(datos.fecha.getTime()),
        accion: datos.accion,
        idUsuario: datos.idUsuario,
        entidad: datos.entidad,
        idEntidad: datos.idEntidad,
        detalle,
      }),
      descartados,
    };
  }

  /** Reconstruye un registro leído de la base (ya validado al guardarse). */
  static reconstituir(datos: DatosRegistroActividad): RegistroActividad {
    return new RegistroActividad({
      ...datos,
      fecha: new Date(datos.fecha.getTime()),
      detalle: Object.freeze({ ...datos.detalle }),
    });
  }

  private static invalido(campo: string): DatosInvalidosError {
    return new DatosInvalidosError(MENSAJE_REGISTRO_INVALIDO, {
      errores: [{ campo, errores: [MENSAJE_REGISTRO_INVALIDO] }],
    });
  }

  get id(): string {
    return this.datos.id;
  }

  get fecha(): Date {
    return new Date(this.datos.fecha.getTime());
  }

  get accion(): AccionAuditoria {
    return this.datos.accion;
  }

  get idUsuario(): string | null {
    return this.datos.idUsuario;
  }

  get entidad(): EntidadAuditoria | null {
    return this.datos.entidad;
  }

  get idEntidad(): string | null {
    return this.datos.idEntidad;
  }

  get detalle(): DetalleAuditoria {
    return this.datos.detalle;
  }
}
