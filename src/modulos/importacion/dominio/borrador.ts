import { Dinero } from '../../../compartido/dominio/dinero.js';
import {
  claveDeBusqueda,
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

/** Longitud máxima de la descripción de un producto (igual que `POST /productos`). */
const LONGITUD_MAXIMA_DESCRIPCION = 2000;

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
  /** Códigos ya aprobados en otra importación (`YA_IMPORTADO`). */
  codigosYaImportados: ReadonlySet<string>;
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
  advertencias: readonly AdvertenciaBorrador[];
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
    const yaImportado =
      extraido.codigo !== null && datos.codigosYaImportados.has(extraido.codigo);
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
        persistentes: [
          ...extraido.advertencias,
          ...(yaImportado ? (['YA_IMPORTADO'] as const) : []),
        ],
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

  get esPendiente(): boolean {
    return this.datos.estado === 'PENDIENTE';
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
      if (this.datos.precio === null || !precio.esIgualA(this.datos.precio)) {
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
    siguiente.advertencias = calcularAdvertencias({
      codigo: siguiente.codigo,
      nombre: siguiente.nombre,
      precio: siguiente.precio,
      precioNormal: siguiente.precioNormal,
      // `NOMBRE_DUDOSO` fijado al leer solo se quita al corregir el nombre.
      persistentes: this.datos.advertencias.filter(
        (advertencia) => !(nombreEditado && advertencia === 'NOMBRE_DUDOSO'),
      ),
    });
    siguiente.actualizadoEn = ahora;
    return { borrador: new Borrador(siguiente), campos };
  }

  /** Descripción del producto: la del borrador terminada en `Cód. <código>` (el producto no tiene columna de código). */
  descripcionParaProducto(): string {
    const base = this.datos.descripcion ?? '';
    if (this.datos.codigo === null) {
      return base;
    }
    const sufijo = `Cód. ${this.datos.codigo}`;
    if (base.endsWith(sufijo)) {
      return base;
    }
    if (base === '') {
      return sufijo;
    }
    const cupo = LONGITUD_MAXIMA_DESCRIPCION - [...sufijo].length - 1;
    const recortada = [...base].slice(0, cupo).join('').trimEnd();
    return `${recortada} ${sufijo}`;
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

  aPublico(): BorradorPublico {
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
      advertencias: this.datos.advertencias,
      idProducto: this.datos.idProducto,
    };
  }
}
