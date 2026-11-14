import { Dinero } from '../../../compartido/dominio/dinero.js';
import { errorDeCampo } from '../../../compartido/dominio/error-campo.js';
import { claveDeBusqueda } from './busqueda.js';
import {
  DISPONIBILIDAD_POR_DEFECTO,
  type Disponibilidad,
  validarDisponibilidad,
} from './disponibilidad.js';

export const LONGITUD_MINIMA_NOMBRE = 2;
export const LONGITUD_MAXIMA_NOMBRE = 120;
export const LONGITUD_MAXIMA_DESCRIPCION = 2000;

/** De 1 a 5 enteros y hasta 2 decimales: «12», «12.5», «99999.99». */
export const FORMATO_PRECIO = /^\d{1,5}(\.\d{1,2})?$/;

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MENSAJE_NOMBRE_INVALIDO =
  'Ingrese el nombre del producto (2 a 120 caracteres).';
export const MENSAJE_PRECIO_INVALIDO =
  'El precio debe ser un texto decimal mayor que 0 y hasta 99999.99, con máximo 2 decimales.';
export const MENSAJE_DESCRIPCION_INVALIDA =
  'La descripción debe ser un texto de hasta 2000 caracteres.';
export const MENSAJE_MARCA_ID_INVALIDO =
  'La marca debe indicarse con su identificador (UUID).';

/** Vista pública de un producto para otros módulos y para la API. */
export interface ProductoPublico {
  id: string;
  nombre: string;
  marcaId: string;
  /** Dinero exacto; se serializa como texto `"12.50"`. */
  precio: Dinero;
  descripcion: string;
  disponibilidad: Disponibilidad;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DatosProducto {
  id: string;
  nombre: string;
  marcaId: string;
  precio: Dinero;
  descripcion: string;
  disponibilidad: Disponibilidad;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DatosCrearProducto {
  id: string;
  nombre: unknown;
  marcaId: unknown;
  precio: unknown;
  /** Opcional: por defecto vacía. */
  descripcion?: unknown;
  /** Opcional: por defecto `DISPONIBLE`. */
  disponibilidad?: unknown;
  ahora: Date;
}

/** Cambios parciales: `undefined` = sin cambio. */
export interface CambiosProducto {
  nombre?: unknown;
  marcaId?: unknown;
  precio?: unknown;
  descripcion?: unknown;
  disponibilidad?: unknown;
}

export type CampoProducto =
  'nombre' | 'marcaId' | 'precio' | 'descripcion' | 'disponibilidad';

/** Nombre de 2 a 120 caracteres tras recortar y unir espacios repetidos. */
export function validarNombreProducto(entrada: unknown): string {
  if (typeof entrada !== 'string') {
    throw errorDeCampo('nombre', MENSAJE_NOMBRE_INVALIDO);
  }
  const recortado = entrada.trim().replace(/\s+/g, ' ');
  // Se cuentan puntos de código, no unidades UTF-16.
  const longitud = [...recortado].length;
  if (longitud < LONGITUD_MINIMA_NOMBRE || longitud > LONGITUD_MAXIMA_NOMBRE) {
    throw errorDeCampo('nombre', MENSAJE_NOMBRE_INVALIDO);
  }
  return recortado;
}

/**
 * Precio: cadena `^\d{1,5}(\.\d{1,2})?$` mayor que cero (RNF-03, RN-11).
 * Nunca se acepta un número: el dinero viaja como texto decimal exacto.
 */
export function validarPrecio(entrada: unknown): Dinero {
  if (typeof entrada !== 'string' || !FORMATO_PRECIO.test(entrada)) {
    throw errorDeCampo('precio', MENSAJE_PRECIO_INVALIDO);
  }
  const precio = Dinero.desdeTexto(entrada);
  if (!precio.esMayorQue(Dinero.CERO)) {
    throw errorDeCampo('precio', MENSAJE_PRECIO_INVALIDO);
  }
  return precio;
}

/** Descripción de 0 a 2000 caracteres (se recortan los espacios de los extremos). */
export function validarDescripcion(entrada: unknown): string {
  if (typeof entrada !== 'string') {
    throw errorDeCampo('descripcion', MENSAJE_DESCRIPCION_INVALIDA);
  }
  const recortada = entrada.trim();
  if ([...recortada].length > LONGITUD_MAXIMA_DESCRIPCION) {
    throw errorDeCampo('descripcion', MENSAJE_DESCRIPCION_INVALIDA);
  }
  return recortada;
}

export function validarMarcaId(entrada: unknown): string {
  if (typeof entrada !== 'string' || !FORMATO_UUID.test(entrada)) {
    throw errorDeCampo('marcaId', MENSAJE_MARCA_ID_INVALIDO);
  }
  return entrada.toLowerCase();
}

/**
 * Producto de un catálogo (RF-PRO-01, RF-PRO-02, RF-PRO-05, RN-09). Inmutable:
 * los cambios devuelven una instancia nueva. La eliminación (lógica, PA-07) la
 * resuelve el repositorio: un producto eliminado nunca se reconstituye.
 */
export class Producto {
  private constructor(private readonly datos: DatosProducto) {}

  static crear(datos: DatosCrearProducto): Producto {
    return new Producto({
      id: datos.id,
      nombre: validarNombreProducto(datos.nombre),
      marcaId: validarMarcaId(datos.marcaId),
      precio: validarPrecio(datos.precio),
      descripcion:
        datos.descripcion === undefined
          ? ''
          : validarDescripcion(datos.descripcion),
      disponibilidad:
        datos.disponibilidad === undefined
          ? DISPONIBILIDAD_POR_DEFECTO
          : validarDisponibilidad(datos.disponibilidad),
      creadoEn: datos.ahora,
      actualizadoEn: datos.ahora,
    });
  }

  static reconstituir(datos: DatosProducto): Producto {
    return new Producto({ ...datos });
  }

  get id(): string {
    return this.datos.id;
  }
  get nombre(): string {
    return this.datos.nombre;
  }
  get marcaId(): string {
    return this.datos.marcaId;
  }
  get precio(): Dinero {
    return this.datos.precio;
  }
  get descripcion(): string {
    return this.datos.descripcion;
  }
  get disponibilidad(): Disponibilidad {
    return this.datos.disponibilidad;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }

  /** Nombre sin tildes ni mayúsculas, para buscar y ordenar. */
  get nombreBusqueda(): string {
    return claveDeBusqueda(this.datos.nombre);
  }

  /** Descripción sin tildes ni mayúsculas, para buscar. */
  get descripcionBusqueda(): string {
    return claveDeBusqueda(this.datos.descripcion);
  }

  /**
   * Aplica cambios parciales. Devuelve el producto nuevo, los campos que de
   * verdad cambiaron (para la bitácora) y, si cambió el precio, el anterior
   * (CA-05). Sin cambios, el mismo producto.
   */
  aplicar(
    cambios: CambiosProducto,
    ahora: Date,
  ): {
    producto: Producto;
    campos: CampoProducto[];
    precioAnterior: Dinero | null;
  } {
    const siguiente: DatosProducto = { ...this.datos };
    const campos: CampoProducto[] = [];
    let precioAnterior: Dinero | null = null;

    if (cambios.nombre !== undefined) {
      const nombre = validarNombreProducto(cambios.nombre);
      if (nombre !== this.datos.nombre) {
        siguiente.nombre = nombre;
        campos.push('nombre');
      }
    }
    if (cambios.marcaId !== undefined) {
      const marcaId = validarMarcaId(cambios.marcaId);
      if (marcaId !== this.datos.marcaId) {
        siguiente.marcaId = marcaId;
        campos.push('marcaId');
      }
    }
    if (cambios.precio !== undefined) {
      const precio = validarPrecio(cambios.precio);
      if (!precio.esIgualA(this.datos.precio)) {
        siguiente.precio = precio;
        precioAnterior = this.datos.precio;
        campos.push('precio');
      }
    }
    if (cambios.descripcion !== undefined) {
      const descripcion = validarDescripcion(cambios.descripcion);
      if (descripcion !== this.datos.descripcion) {
        siguiente.descripcion = descripcion;
        campos.push('descripcion');
      }
    }
    if (cambios.disponibilidad !== undefined) {
      const disponibilidad = validarDisponibilidad(cambios.disponibilidad);
      if (disponibilidad !== this.datos.disponibilidad) {
        siguiente.disponibilidad = disponibilidad;
        campos.push('disponibilidad');
      }
    }

    if (campos.length === 0) {
      return { producto: this, campos, precioAnterior };
    }
    siguiente.actualizadoEn = ahora;
    return { producto: new Producto(siguiente), campos, precioAnterior };
  }

  aPublico(): ProductoPublico {
    return {
      id: this.id,
      nombre: this.nombre,
      marcaId: this.marcaId,
      precio: this.precio,
      descripcion: this.descripcion,
      disponibilidad: this.disponibilidad,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
