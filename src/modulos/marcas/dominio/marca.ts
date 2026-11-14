import { errorDeCampo } from '../../../compartido/dominio/error-campo.js';
import { normalizarColor, type ColorTexto, textoSobre } from './color.js';
import { NombreMarca } from './nombre-marca.js';

export const ORDEN_MAXIMO = 2_147_483_647;
export const MENSAJE_ORDEN_INVALIDO =
  'El orden debe ser un entero mayor o igual a 0.';
export const MENSAJE_ACTIVA_INVALIDA =
  'Indique si la marca está activa (true o false).';

/** Vista pública de una marca para otros módulos y para la API. */
export interface MarcaPublica {
  id: string;
  nombre: string;
  color: string;
  colorAcento: string | null;
  /** Solo lectura: texto con contraste ≥ 4.5:1 sobre `color` (RNF-11). */
  textoSobreColor: ColorTexto;
  /** Solo lectura: ídem sobre `colorAcento`; `null` si no hay acento. */
  textoSobreAcento: ColorTexto | null;
  activa: boolean;
  orden: number;
  creadaEn: Date;
}

export interface DatosMarca {
  id: string;
  nombre: NombreMarca;
  color: string;
  colorAcento: string | null;
  activa: boolean;
  orden: number;
  creadaEn: Date;
  actualizadaEn: Date;
}

export interface DatosCrearMarca {
  id: string;
  nombre: unknown;
  color: unknown;
  colorAcento?: unknown;
  orden: unknown;
  ahora: Date;
}

/** Cambios parciales: `undefined` = sin cambio; `colorAcento: null` quita el acento. */
export interface CambiosMarca {
  nombre?: unknown;
  color?: unknown;
  colorAcento?: unknown;
  activa?: unknown;
  orden?: unknown;
}

export type CampoMarca =
  'nombre' | 'color' | 'colorAcento' | 'activa' | 'orden';

export function validarOrden(entrada: unknown): number {
  if (
    typeof entrada !== 'number' ||
    !Number.isInteger(entrada) ||
    entrada < 0 ||
    entrada > ORDEN_MAXIMO
  ) {
    throw errorDeCampo('orden', MENSAJE_ORDEN_INVALIDO);
  }
  return entrada;
}

function validarColorAcento(entrada: unknown): string | null {
  return entrada === null || entrada === undefined
    ? null
    : normalizarColor(entrada, 'colorAcento');
}

/**
 * Marca de un catálogo (RF-PRO-04, D-43). Inmutable: los cambios devuelven una
 * instancia nueva. No se elimina: se desactiva (`activa`).
 */
export class Marca {
  private constructor(private readonly datos: DatosMarca) {}

  static crear(datos: DatosCrearMarca): Marca {
    return new Marca({
      id: datos.id,
      nombre: NombreMarca.crear(datos.nombre),
      color: normalizarColor(datos.color),
      colorAcento: validarColorAcento(datos.colorAcento),
      activa: true,
      orden: validarOrden(datos.orden),
      creadaEn: datos.ahora,
      actualizadaEn: datos.ahora,
    });
  }

  static reconstituir(datos: DatosMarca): Marca {
    return new Marca({ ...datos });
  }

  get id(): string {
    return this.datos.id;
  }
  get nombre(): NombreMarca {
    return this.datos.nombre;
  }
  get color(): string {
    return this.datos.color;
  }
  get colorAcento(): string | null {
    return this.datos.colorAcento;
  }
  get activa(): boolean {
    return this.datos.activa;
  }
  get orden(): number {
    return this.datos.orden;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  get actualizadaEn(): Date {
    return this.datos.actualizadaEn;
  }

  get textoSobreColor(): ColorTexto {
    return textoSobre(this.datos.color);
  }

  get textoSobreAcento(): ColorTexto | null {
    return this.datos.colorAcento === null
      ? null
      : textoSobre(this.datos.colorAcento);
  }

  /**
   * Aplica cambios parciales. Devuelve la marca nueva y los campos que de
   * verdad cambiaron (para la bitácora); sin cambios, la misma marca.
   */
  aplicar(
    cambios: CambiosMarca,
    ahora: Date,
  ): { marca: Marca; campos: CampoMarca[] } {
    const siguiente: DatosMarca = { ...this.datos };
    const campos: CampoMarca[] = [];

    if (cambios.nombre !== undefined) {
      const nombre = NombreMarca.crear(cambios.nombre);
      if (nombre.valor !== this.datos.nombre.valor) {
        siguiente.nombre = nombre;
        campos.push('nombre');
      }
    }
    if (cambios.color !== undefined) {
      const color = normalizarColor(cambios.color);
      if (color !== this.datos.color) {
        siguiente.color = color;
        campos.push('color');
      }
    }
    if (cambios.colorAcento !== undefined) {
      const acento = validarColorAcento(cambios.colorAcento);
      if (acento !== this.datos.colorAcento) {
        siguiente.colorAcento = acento;
        campos.push('colorAcento');
      }
    }
    if (cambios.activa !== undefined) {
      if (typeof cambios.activa !== 'boolean') {
        throw errorDeCampo('activa', MENSAJE_ACTIVA_INVALIDA);
      }
      if (cambios.activa !== this.datos.activa) {
        siguiente.activa = cambios.activa;
        campos.push('activa');
      }
    }
    if (cambios.orden !== undefined) {
      const orden = validarOrden(cambios.orden);
      if (orden !== this.datos.orden) {
        siguiente.orden = orden;
        campos.push('orden');
      }
    }

    if (campos.length === 0) {
      return { marca: this, campos };
    }
    siguiente.actualizadaEn = ahora;
    return { marca: new Marca(siguiente), campos };
  }

  aPublica(): MarcaPublica {
    return {
      id: this.id,
      nombre: this.nombre.valor,
      color: this.color,
      colorAcento: this.colorAcento,
      textoSobreColor: this.textoSobreColor,
      textoSobreAcento: this.textoSobreAcento,
      activa: this.activa,
      orden: this.orden,
      creadaEn: this.creadaEn,
    };
  }
}
