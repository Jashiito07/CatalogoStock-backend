/**
 * Dobles en memoria para las pruebas unitarias de los casos de uso de la
 * importación. El nombre termina en `spec.ts` para que no se compile en
 * `dist/`, pero no en `.spec.ts`, para que Vitest no lo tome como archivo de
 * pruebas.
 */
import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { ErrorDominio } from '../../../../compartido/dominio/errores.js';
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
import type { Borrador } from '../../dominio/borrador.js';
import type { Importacion, TotalesImportacion } from '../../dominio/importacion.js';
import { requiereRevision } from '../../dominio/advertencias.js';
import type { PaginaTexto } from '../../dominio/texto-pagina.js';
import type {
  BorradorRepositorio,
  FiltroBorradores,
} from '../puertos/borrador.repositorio.js';
import type { CalculadorHuella } from '../puertos/calculador-huella.puerto.js';
import type {
  CreadorProductos,
  DatosProductoAprobado,
} from '../puertos/creador-productos.puerto.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import {
  HuellaDuplicadaError,
  type ImportacionRepositorio,
} from '../puertos/importacion.repositorio.js';
import type { LectorPdf } from '../puertos/lector-pdf.puerto.js';

export const INICIO = new Date('2026-11-16T15:00:00.000Z');
export const ID_VENDEDOR = '00000000-0000-4000-8000-0000000000aa';
export const ID_MARCA_ACTIVA = '00000000-0000-4000-8000-0000000000b1';
export const ID_MARCA_INACTIVA = '00000000-0000-4000-8000-0000000000b2';
export const ID_MARCA_INEXISTENTE = '00000000-0000-4000-8000-0000000000b9';

export class RelojFalso implements Reloj {
  ahora(): Date {
    return INICIO;
  }
}

export function generadorIdSecuencial(): GeneradorId {
  let siguiente = 1;
  return {
    generar: () =>
      `00000000-0000-4000-8000-${String(siguiente++).padStart(12, '0')}`,
  };
}

function marca(id: string, nombre: string, activa: boolean): MarcaPublica {
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

export class DirectorioMarcasEnMemoria implements DirectorioMarcas {
  marcas: MarcaPublica[] = [
    marca(ID_MARCA_ACTIVA, 'Yanbal', true),
    marca(ID_MARCA_INACTIVA, 'Cyzone', false),
  ];

  buscarPorId(id: string): Promise<MarcaPublica | null> {
    return Promise.resolve(this.marcas.find((m) => m.id === id) ?? null);
  }

  buscarPorIds(ids: readonly string[]): Promise<MarcaPublica[]> {
    return Promise.resolve(this.marcas.filter((m) => ids.includes(m.id)));
  }
}

export class ImportacionRepositorioEnMemoria implements ImportacionRepositorio {
  importaciones: Importacion[] = [];
  /** Con `true`, la primera `buscarPorHuella` no ve la importación rival (carrera de dos subidas del mismo PDF). */
  ocultarEnLaPrimeraBusqueda = false;

  insertar(importacion: Importacion): Promise<void> {
    if (this.importaciones.some((i) => i.huella === importacion.huella)) {
      return Promise.reject(new HuellaDuplicadaError());
    }
    this.importaciones.push(importacion);
    return Promise.resolve();
  }

  buscarPorId(id: string): Promise<Importacion | null> {
    return Promise.resolve(this.importaciones.find((i) => i.id === id) ?? null);
  }

  buscarPorHuella(huella: string): Promise<Importacion | null> {
    if (this.ocultarEnLaPrimeraBusqueda) {
      // La subida rival aún no se había guardado cuando se hizo la primera búsqueda.
      this.ocultarEnLaPrimeraBusqueda = false;
      return Promise.resolve(null);
    }
    return Promise.resolve(
      this.importaciones.find((i) => i.huella === huella) ?? null,
    );
  }
}

export class BorradorRepositorioEnMemoria implements BorradorRepositorio {
  borradores: Borrador[] = [];
  /** Códigos que se consideran ya aprobados en otra importación. */
  yaAprobados = new Set<string>();

  insertarVarios(nuevos: readonly Borrador[]): Promise<void> {
    this.borradores.push(...nuevos);
    return Promise.resolve();
  }

  buscarPorId(id: string): Promise<Borrador | null> {
    return Promise.resolve(this.borradores.find((b) => b.id === id) ?? null);
  }

  bloquearPorId(id: string): Promise<Borrador | null> {
    return this.buscarPorId(id);
  }

  guardar(borrador: Borrador): Promise<boolean> {
    const indice = this.borradores.findIndex((b) => b.id === borrador.id);
    if (indice < 0) {
      return Promise.resolve(false);
    }
    this.borradores[indice] = borrador;
    return Promise.resolve(true);
  }

  listar(
    filtro: FiltroBorradores,
    paginacion: Paginacion,
  ): Promise<Pagina<Borrador>> {
    const coincidencias = this.borradores
      .filter((b) => b.idImportacion === filtro.idImportacion)
      .filter((b) => b.estado === filtro.estado)
      .filter(
        (b) =>
          filtro.conAdvertencias === undefined ||
          requiereRevision(b.advertencias) === filtro.conAdvertencias,
      )
      .filter((b) => filtro.paginaPdf === undefined || b.pagina === filtro.paginaPdf)
      .filter(
        (b) =>
          !filtro.clave ||
          b.nombreBusqueda.includes(filtro.clave) ||
          (b.codigo ?? '').toLowerCase().includes(filtro.clave),
      )
      .toSorted((a, b) => a.pagina - b.pagina || a.posicion - b.posicion);
    const inicio = desplazamiento(paginacion);
    return Promise.resolve({
      elementos: coincidencias.slice(inicio, inicio + paginacion.tamanio),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total: coincidencias.length,
    });
  }

  totales(idImportacion: string): Promise<TotalesImportacion> {
    const propios = this.borradores.filter((b) => b.idImportacion === idImportacion);
    const pendientes = propios.filter((b) => b.estado === 'PENDIENTE');
    return Promise.resolve({
      pendientes: pendientes.length,
      aprobados: propios.filter((b) => b.estado === 'APROBADO').length,
      descartados: propios.filter((b) => b.estado === 'DESCARTADO').length,
      conAdvertencias: pendientes.filter((b) => requiereRevision(b.advertencias)).length,
    });
  }

  codigosAprobados(codigos: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(codigos.filter((c) => this.yaAprobados.has(c))));
  }
}

/** Entrega páginas ya leídas (o falla) sin tocar ningún PDF. */
export class LectorPdfFalso implements LectorPdf {
  llamadas = 0;

  constructor(
    public paginas: PaginaTexto[] = [],
    public error: Error | undefined = undefined,
  ) {}

  leer(): Promise<PaginaTexto[]> {
    this.llamadas++;
    return this.error === undefined
      ? Promise.resolve(this.paginas)
      : Promise.reject(this.error);
  }
}

/** Huella de prueba: el contenido en hexadecimal rellenado a 64 caracteres. */
export class CalculadorHuellaFalso implements CalculadorHuella {
  calcular(contenido: Uint8Array): string {
    return Buffer.from(contenido).toString('hex').padEnd(64, '0').slice(0, 64);
  }
}

export class CreadorProductosFalso implements CreadorProductos {
  creados: DatosProductoAprobado[] = [];
  /** Nombres que fallan con el error indicado. */
  fallos = new Map<string, ErrorDominio>();
  private contador = 0;

  crear(datos: DatosProductoAprobado): Promise<string> {
    const fallo = this.fallos.get(datos.nombre);
    if (fallo !== undefined) {
      return Promise.reject(fallo);
    }
    this.creados.push(datos);
    this.contador++;
    return Promise.resolve(
      `00000000-0000-4000-8000-${String(900 + this.contador).padStart(12, '0')}`,
    );
  }
}

export class UnidadDeTrabajoFalsa implements UnidadDeTrabajo {
  activa = false;
  transacciones = 0;

  async ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    if (this.activa) {
      return trabajo();
    }
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

export class AuditoriaFalsa implements ServicioAuditoria {
  readonly registradas: ActividadRegistrada[] = [];

  constructor(private readonly unidad: UnidadDeTrabajoFalsa) {}

  registrar(actividad: RegistrarActividad): Promise<void> {
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
