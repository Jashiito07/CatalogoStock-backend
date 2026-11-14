/**
 * Dobles en memoria para las pruebas unitarias de los casos de uso de productos.
 * El nombre termina en `spec.ts` para que no se compile en `dist/`, pero no
 * en `.spec.ts`, para que Vitest no lo tome como archivo de pruebas.
 */
import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import {
  desplazamiento,
  type Pagina,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type {
  RegistrarActividad,
  ServicioAuditoria,
} from '../../../auditoria/index.js';
import type { MarcaPublica } from '../../../marcas/index.js';
import type { Producto } from '../../dominio/producto.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type {
  FiltroProductos,
  ProductoRepositorio,
} from '../puertos/producto.repositorio.js';

export const INICIO = new Date('2026-11-11T15:00:00.000Z');
export const ID_VENDEDOR = '00000000-0000-4000-8000-0000000000aa';
export const ID_MARCA_ACTIVA = '00000000-0000-4000-8000-0000000000b1';
export const ID_MARCA_INACTIVA = '00000000-0000-4000-8000-0000000000b2';
export const ID_MARCA_INEXISTENTE = '00000000-0000-4000-8000-0000000000b9';

export class RelojFalso implements Reloj {
  constructor(public actual: Date = INICIO) {}
  ahora(): Date {
    return this.actual;
  }
}

export function generadorIdSecuencial(): GeneradorId {
  let siguiente = 1;
  return {
    generar: () =>
      `00000000-0000-4000-8000-${String(siguiente++).padStart(12, '0')}`,
  };
}

export function marcaPublica(
  id: string,
  nombre: string,
  activa = true,
): MarcaPublica {
  return {
    id,
    nombre,
    color: '#2563EB',
    colorAcento: null,
    textoSobreColor: '#FFFFFF',
    textoSobreAcento: null,
    activa,
    orden: 0,
    creadaEn: INICIO,
  };
}

/** Directorio de marcas en memoria: una activa y una inactiva por defecto. */
export class DirectorioMarcasEnMemoria implements DirectorioMarcas {
  marcas: MarcaPublica[] = [
    marcaPublica(ID_MARCA_ACTIVA, 'Avon'),
    marcaPublica(ID_MARCA_INACTIVA, 'Cyzone', false),
  ];

  buscarPorId(id: string): Promise<MarcaPublica | null> {
    return Promise.resolve(this.marcas.find((m) => m.id === id) ?? null);
  }

  buscarPorIds(ids: readonly string[]): Promise<MarcaPublica[]> {
    return Promise.resolve(this.marcas.filter((m) => ids.includes(m.id)));
  }

  listarActivas(): Promise<MarcaPublica[]> {
    return Promise.resolve(this.marcas.filter((m) => m.activa));
  }
}

/** Repositorio en memoria con la misma eliminación lógica y filtros que el real. */
export class ProductoRepositorioEnMemoria implements ProductoRepositorio {
  productos: Producto[] = [];
  eliminados = new Set<string>();

  buscarPorId(id: string): Promise<Producto | null> {
    return Promise.resolve(
      this.productos.find((p) => p.id === id && !this.eliminados.has(id)) ??
        null,
    );
  }

  listar(
    filtro: FiltroProductos,
    paginacion: Paginacion,
  ): Promise<Pagina<Producto>> {
    const coincidencias = this.productos
      .filter((p) => !this.eliminados.has(p.id))
      .filter((p) => !filtro.marcaIds || filtro.marcaIds.includes(p.marcaId))
      .filter(
        (p) =>
          !filtro.disponibilidad || p.disponibilidad === filtro.disponibilidad,
      )
      .filter(
        (p) =>
          !filtro.clave ||
          p.nombreBusqueda.includes(filtro.clave) ||
          p.descripcionBusqueda.includes(filtro.clave),
      )
      .toSorted(
        (a, b) =>
          a.nombreBusqueda.localeCompare(b.nombreBusqueda) ||
          a.id.localeCompare(b.id),
      );
    const inicio = desplazamiento(paginacion);
    return Promise.resolve({
      elementos: coincidencias.slice(inicio, inicio + paginacion.tamanio),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total: coincidencias.length,
    });
  }

  crear(producto: Producto): Promise<void> {
    this.productos.push(producto);
    return Promise.resolve();
  }

  guardar(producto: Producto): Promise<boolean> {
    const indice = this.productos.findIndex((p) => p.id === producto.id);
    if (indice < 0 || this.eliminados.has(producto.id)) {
      return Promise.resolve(false);
    }
    this.productos[indice] = producto;
    return Promise.resolve(true);
  }

  marcarEliminado(id: string): Promise<boolean> {
    if (!this.productos.some((p) => p.id === id) || this.eliminados.has(id)) {
      return Promise.resolve(false);
    }
    this.eliminados.add(id);
    return Promise.resolve(true);
  }
}

/** Unidad de trabajo en memoria que recuerda si hay una transacción abierta. */
export class UnidadDeTrabajoFalsa implements UnidadDeTrabajo {
  activa = false;
  transacciones = 0;

  async ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    this.transacciones++;
    this.activa = true;
    try {
      return await trabajo();
    } finally {
      this.activa = false;
    }
  }
}

export interface ActividadRegistrada {
  actividad: RegistrarActividad;
  enTransaccion: boolean;
}

/** Bitácora en memoria; con `fallo` definido, `registrar` falla. */
export class AuditoriaFalsa implements ServicioAuditoria {
  readonly registradas: ActividadRegistrada[] = [];
  fallo: Error | undefined;

  constructor(private readonly unidad: UnidadDeTrabajoFalsa) {}

  registrar(actividad: RegistrarActividad): Promise<void> {
    if (this.fallo) {
      return Promise.reject(this.fallo);
    }
    this.registradas.push({
      actividad: structuredClone(actividad),
      enTransaccion: this.unidad.activa,
    });
    return Promise.resolve();
  }

  registrarSinInterrumpir(): Promise<void> {
    return Promise.resolve();
  }

  acciones(): string[] {
    return this.registradas.map((r) => r.actividad.accion);
  }
}
