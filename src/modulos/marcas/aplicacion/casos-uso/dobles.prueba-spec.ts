/**
 * Dobles en memoria para las pruebas unitarias de los casos de uso de marcas.
 * El nombre termina en `spec.ts` para que no se compile en `dist/`, pero no
 * en `.spec.ts`, para que Vitest no lo tome como archivo de pruebas.
 */
import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type {
  RegistrarActividad,
  ServicioAuditoria,
} from '../../../auditoria/index.js';
import { MarcaDuplicadaError } from '../../dominio/errores-marca.js';
import type { Marca } from '../../dominio/marca.js';
import type { MarcaRepositorio } from '../puertos/marca.repositorio.js';

export const INICIO = new Date('2026-11-11T15:00:00.000Z');
export const ID_VENDEDOR = '00000000-0000-4000-8000-0000000000aa';

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

/** Repositorio en memoria con la misma unicidad que `uq_marcas_nombre_busqueda`. */
export class MarcaRepositorioEnMemoria implements MarcaRepositorio {
  marcas: Marca[] = [];

  buscarPorId(id: string): Promise<Marca | null> {
    return Promise.resolve(this.marcas.find((m) => m.id === id) ?? null);
  }

  buscarPorClaveNombre(clave: string): Promise<Marca | null> {
    return Promise.resolve(
      this.marcas.find((m) => m.nombre.clave === clave) ?? null,
    );
  }

  buscarPorIds(ids: readonly string[]): Promise<Marca[]> {
    return Promise.resolve(this.marcas.filter((m) => ids.includes(m.id)));
  }

  listar(incluirInactivas: boolean): Promise<Marca[]> {
    return Promise.resolve(
      this.marcas
        .filter((m) => incluirInactivas || m.activa)
        .toSorted(
          (a, b) =>
            a.orden - b.orden || a.nombre.clave.localeCompare(b.nombre.clave),
        ),
    );
  }

  siguienteOrden(): Promise<number> {
    return Promise.resolve(
      this.marcas.length === 0
        ? 0
        : Math.max(...this.marcas.map((m) => m.orden)) + 1,
    );
  }

  crear(marca: Marca): Promise<void> {
    if (this.marcas.some((m) => m.nombre.clave === marca.nombre.clave)) {
      return Promise.reject(new MarcaDuplicadaError());
    }
    this.marcas.push(marca);
    return Promise.resolve();
  }

  guardar(marca: Marca): Promise<void> {
    if (
      this.marcas.some(
        (m) => m.id !== marca.id && m.nombre.clave === marca.nombre.clave,
      )
    ) {
      return Promise.reject(new MarcaDuplicadaError());
    }
    const indice = this.marcas.findIndex((m) => m.id === marca.id);
    if (indice >= 0) {
      this.marcas[indice] = marca;
    }
    return Promise.resolve();
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
