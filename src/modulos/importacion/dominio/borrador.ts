import { Dinero } from '../../../compartido/dominio/dinero.js';
import {
  claveDeBusqueda,
  claveDeEmparejamiento,
  type Disponibilidad,
  validarDescripcion,
  validarDisponibilidad,
  validarMarcaId,
  validarNombreProducto,
  validarPrecio,
} from '../../productos/validaciones.js';
import {
  type AdvertenciaBorrador,
  calcularAdvertencias,
  conEmparejamiento,
  type EmparejadoPor,
} from './advertencias.js';
import { BorradorNoEditableError } from './errores-importacion.js';
import type { BorradorExtraido } from './lector-catalogo.js';

/** Estado de un borrador: solo el `PENDIENTE` se edita, se aprueba o se descarta. */
export const ESTADOS_BORRADOR = ['PENDIENTE', 'APROBADO', 'DESCARTADO'] as const;

export type EstadoBorrador = (typeof ESTADOS_BORRADOR)[number];

export function esEstadoBorrador(valor: unknown): valor is EstadoBorrador {
  return (
    typeof valor === 'string' &&
    (ESTADOS_BORRADOR as readonly string[]).includes(valor)
  );
}

/**
 * Producto no eliminado de la misma marca con el mismo código que un borrador
 * pendiente (D-57): al aprobar el borrador se actualiza **solo su precio**.
 */
export interface ProductoExistente {
  id: string;
  nombre: string;
  /** Precio actual del producto (dinero exacto, se serializa como texto). */
  precio: Dinero;
  /** Cómo se emparejó: por el código del catálogo o, sin código, por el nombre (D-57). */
  emparejadoPor: EmparejadoPor;
}

export interface DatosBorrador {
  id: string;
  idImportacion: string;
  /** Página del PDF de donde salió. */
  pagina: number;
  /** Orden de lectura dentro de la página. */
  posicion: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: Dinero | null;
  precioNormal: Dinero | null;
  marcaId: string;
  disponibilidad: Disponibilidad;
  estado: EstadoBorrador;
  advertencias: AdvertenciaBorrador[];
  idProducto: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DatosNuevoBorrador {
  id: string;
  idImportacion: string;
  marcaId: string;
  extraido: BorradorExtraido;
  ahora: Date;
}

/** Cambios parciales de `PATCH`: `undefined` = sin cambio. */
export interface CambiosBorrador {
  nombre?: unknown;
  descripcion?: unknown;
  precio?: unknown;
  marcaId?: unknown;
  disponibilidad?: unknown;
}

export type CampoBorrador =
  'nombre' | 'descripcion' | 'precio' | 'marcaId' | 'disponibilidad';

/** Vista pública de un borrador (el precio es dinero exacto, se serializa como texto). */
export interface BorradorPublico {
  id: string;
  idImportacion: string;
  pagina: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: Dinero | null;
  precioNormal: Dinero | null;
  marcaId: string;
  disponibilidad: Disponibilidad;
  estado: EstadoBorrador;
  /**
   * Incluye las informativas de emparejamiento (D-57): `YA_IMPORTADO` (por código),
   * `EMPAREJADO_POR_NOMBRE` o `EMPAREJAMIENTO_AMBIGUO`.
   */
  advertencias: readonly AdvertenciaBorrador[];
  /** Solo en un borrador `PENDIENTE` con código que ya existe en la marca (D-57); si no, `null`. */
  productoExistente: ProductoExistente | null;
  idProducto: string | null;
}

/**
 * Borrador de producto de una importación (RF-PRO-01, D-49). Un borrador
 * **nunca es un producto**: vive en su propia tabla y ninguna consulta de
 * `productos` lo incluye. Inmutable: los cambios devuelven una instancia nueva.
 */
export class Borrador {
  private constructor(private readonly datos: DatosBorrador) {}

  /** Borrador nuevo a partir de lo que leyó el lector del PDF (siempre `PENDIENTE`). */
  static desdeExtraccion(datos: DatosNuevoBorrador): Borrador {
    const { extraido } = datos;
    const precio =
      extraido.precio === null ? null : Dinero.desdeTexto(extraido.precio);
    const precioNormal =
      extraido.precioNormal === null
        ? null
        : Dinero.desdeTexto(extraido.precioNormal);
    return new Borrador({
      id: datos.id,
      idImportacion: datos.idImportacion,
      pagina: extraido.pagina,
      posicion: extraido.posicion,
      codigo: extraido.codigo,
      nombre: extraido.nombre,
      descripcion: extraido.descripcion,
      precio,
      precioNormal,
      marcaId: datos.marcaId,
      disponibilidad: 'DISPONIBLE',
      estado: 'PENDIENTE',
      advertencias: calcularAdvertencias({
        codigo: extraido.codigo,
        nombre: extraido.nombre,
        precio,
        precioNormal,
        persistentes: extraido.advertencias,
      }),
      idProducto: null,
      creadoEn: datos.ahora,
      actualizadoEn: datos.ahora,
    });
  }

  static reconstituir(datos: DatosBorrador): Borrador {
    return new Borrador({ ...datos, advertencias: [...datos.advertencias] });
  }

  get id(): string {
    return this.datos.id;
  }
  get idImportacion(): string {
    return this.datos.idImportacion;
  }
  get pagina(): number {
    return this.datos.pagina;
  }
  get posicion(): number {
    return this.datos.posicion;
  }
  get codigo(): string | null {
    return this.datos.codigo;
  }
  get nombre(): string {
    return this.datos.nombre;
  }
  get descripcion(): string | null {
    return this.datos.descripcion;
  }
  get precio(): Dinero | null {
    return this.datos.precio;
  }
  get precioNormal(): Dinero | null {
    return this.datos.precioNormal;
  }
  get marcaId(): string {
    return this.datos.marcaId;
  }
  get disponibilidad(): Disponibilidad {
    return this.datos.disponibilidad;
  }
  get estado(): EstadoBorrador {
    return this.datos.estado;
  }
  get advertencias(): readonly AdvertenciaBorrador[] {
    return this.datos.advertencias;
  }
  get idProducto(): string | null {
    return this.datos.idProducto;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }

  /** Nombre sin tildes ni mayúsculas, para buscar. */
  get nombreBusqueda(): string {
    return claveDeBusqueda(this.datos.nombre);
  }

  /**
   * 	rue si el borrador se puede emparejar por nombre con un producto sin
   * código (D-57): no tiene código, su nombre no es dudoso y tiene letras o
   * dígitos. Un borrador con código solo se empareja por código.
   */
  get puedeEmparejarPorNombre(): boolean {
    return (
      this.datos.codigo === null &&
      !this.datos.advertencias.includes('NOMBRE_DUDOSO') &&
      claveDeEmparejamiento(this.datos.nombre) !== ''
    );
  }

  get esPendiente(): boolean {
    return this.datos.estado === 'PENDIENTE';
  }

  /**
   * `true` si el precio se heredó de la ficha (`PRECIO_HEREDADO`): no se puede
   * aprobar hasta que el Vendedor lo confirme o lo escriba (`PATCH` con `precio`).
   */
  get precioHeredado(): boolean {
    return this.datos.advertencias.includes('PRECIO_HEREDADO');
  }

  /** `true` si falta el precio: no se puede aprobar hasta que el Vendedor lo escriba. */
  get sinPrecio(): boolean {
    return this.datos.precio === null;
  }

  /**
   * Aplica cambios parciales con las mismas validaciones que `POST
   * /productos` (400 `DATOS_INVALIDOS`) y recalcula las advertencias. Solo un
   * borrador `PENDIENTE` es editable (422 `BORRADOR_NO_EDITABLE`). Devuelve el
   * borrador nuevo y los campos que de verdad cambiaron.
   */
  editar(
    cambios: CambiosBorrador,
    ahora: Date,
  ): { borrador: Borrador; campos: CampoBorrador[] } {
    if (!this.esPendiente) {
      throw new BorradorNoEditableError();
    }
    const siguiente: DatosBorrador = { ...this.datos };
    const campos: CampoBorrador[] = [];

    if (cambios.nombre !== undefined) {
      const nombre = validarNombreProducto(cambios.nombre);
      if (nombre !== this.datos.nombre) {
        siguiente.nombre = nombre;
        campos.push('nombre');
      }
    }
    if (cambios.descripcion !== undefined) {
      const texto = validarDescripcion(cambios.descripcion);
      const descripcion = texto === '' ? null : texto;
      if (descripcion !== this.datos.descripcion) {
        siguiente.descripcion = descripcion;
        campos.push('descripcion');
      }
    }
    if (cambios.precio !== undefined) {
      const precio = validarPrecio(cambios.precio);
      // `PRECIO_HEREDADO`: enviar el precio, aunque sea el mismo, es la confirmación
      // explícita del Vendedor (el precio vino de la ficha, no del propio código).
      if (
        this.datos.precio === null ||
        !precio.esIgualA(this.datos.precio) ||
        this.precioHeredado
      ) {
        siguiente.precio = precio;
        campos.push('precio');
      }
    }
    if (cambios.marcaId !== undefined) {
      const marcaId = validarMarcaId(cambios.marcaId);
      if (marcaId !== this.datos.marcaId) {
        siguiente.marcaId = marcaId;
        campos.push('marcaId');
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
      return { borrador: this, campos };
    }
    const nombreEditado = campos.includes('nombre');
    const precioConfirmado = campos.includes('precio');
    siguiente.advertencias = calcularAdvertencias({
      codigo: siguiente.codigo,
      nombre: siguiente.nombre,
      precio: siguiente.precio,
      precioNormal: siguiente.precioNormal,
      // `NOMBRE_DUDOSO` fijado al leer solo se quita al corregir el nombre y
      // `PRECIO_HEREDADO`, al confirmar o escribir el precio.
      persistentes: this.datos.advertencias.filter(
        (advertencia) =>
          !(nombreEditado && advertencia === 'NOMBRE_DUDOSO') &&
          !(precioConfirmado && advertencia === 'PRECIO_HEREDADO'),
      ),
    });
    siguiente.actualizadoEn = ahora;
    return { borrador: new Borrador(siguiente), campos };
  }

  /**
   * Descripción del producto que se crea: la del borrador, tal cual. El código
   * ya no se agrega al texto: el producto tiene su propia columna `codigo` (D-57).
   */
  descripcionParaProducto(): string {
    return this.datos.descripcion ?? '';
  }

  /** Pasa a `APROBADO` con el producto creado. Quien llama comprueba antes que sea `PENDIENTE` y tenga precio. */
  aprobar(idProducto: string, ahora: Date): Borrador {
    return new Borrador({
      ...this.datos,
      estado: 'APROBADO',
      idProducto,
      actualizadoEn: ahora,
    });
  }

  /** Pasa a `DESCARTADO`; no se puede reactivar en esta versión. */
  descartar(ahora: Date): Borrador {
    return new Borrador({
      ...this.datos,
      estado: 'DESCARTADO',
      actualizadoEn: ahora,
    });
  }

  /**
   * Vista pública. `existente` es el producto con el que se empareja el
   * borrador (D-57): por código, o por nombre si no tiene código. Solo se
   * muestra en un borrador `PENDIENTE` (un aprobado o descartado ya no se va a
   * actualizar) y agrega la advertencia informativa de emparejamiento.
   * `ambiguo` (varios productos sin código con ese nombre) agrega
   * `EMPAREJAMIENTO_AMBIGUO`.
   */
  aPublico(
    existente: ProductoExistente | null = null,
    ambiguo = false,
  ): BorradorPublico {
    const productoExistente = this.esPendiente ? existente : null;
    return {
      id: this.datos.id,
      idImportacion: this.datos.idImportacion,
      pagina: this.datos.pagina,
      codigo: this.datos.codigo,
      nombre: this.datos.nombre,
      descripcion: this.datos.descripcion,
      precio: this.datos.precio,
      precioNormal: this.datos.precioNormal,
      marcaId: this.datos.marcaId,
      disponibilidad: this.datos.disponibilidad,
      estado: this.datos.estado,
      advertencias: conEmparejamiento(
        this.datos.advertencias,
        productoExistente?.emparejadoPor ?? null,
        this.esPendiente && ambiguo,
      ),
      productoExistente,
      idProducto: this.datos.idProducto,
    };
  }
}
