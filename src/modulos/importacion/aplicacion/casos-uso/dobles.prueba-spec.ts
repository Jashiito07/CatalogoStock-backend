/**
 * Dobles en memoria para las pruebas unitarias de los casos de uso de la
 * importación. El nombre termina en `spec.ts` para que no se compile en
 * `dist/`, pero no en `.spec.ts`, para que Vitest no lo tome como archivo de
 * pruebas.
 */
import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { Dinero } from '../../../../compartido/dominio/dinero.js';
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
import {
  claveDeEmparejamiento,
  type Disponibilidad,
} from '../../../productos/validaciones.js';
import type { Borrador } from '../../dominio/borrador.js';
import type { Importacion, TotalesBorradores } from '../../dominio/importacion.js';
import { requiereRevision } from '../../dominio/advertencias.js';
import type { PaginaTexto } from '../../dominio/texto-pagina.js';
import type {
  BorradorRepositorio,
  FiltroBorradores,
  PendienteSinCodigo,
  PendientesPorCodigo,
} from '../puertos/borrador.repositorio.js';
import type { CalculadorHuella } from '../puertos/calculador-huella.puerto.js';
import type {
  CreadorProductos,
  DatosProductoAprobado,
} from '../puertos/creador-productos.puerto.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import {
  type FiltroImportaciones,
  HuellaDuplicadaError,
  type ImportacionRepositorio,
} from '../puertos/importacion.repositorio.js';
import type { LectorPdf } from '../puertos/lector-pdf.puerto.js';
import type {
  ProductoAusente,
  ProductoConCodigo,
  ProductoSinCodigo,
  ProductosExistentes,
} from '../puertos/productos-existentes.puerto.js';

export const INICIO = new Date('2026-11-16T15:00:00.000Z');
export const ID_VENDEDOR = '00000000-0000-4000-8000-0000000000aa';
export const ID_MARCA_ACTIVA = '00000000-0000-4000-8000-0000000000b1';
export const ID_MARCA_INACTIVA = '00000000-0000-4000-8000-0000000000b2';
export const ID_MARCA_INEXISTENTE = '00000000-0000-4000-8000-0000000000b9';
/** Otra marca activa, para probar que archivar no cruza marcas (D-57). */
export const ID_OTRA_MARCA = '00000000-0000-4000-8000-0000000000b3';

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
    marca(ID_OTRA_MARCA, 'Leonisa', true),
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
    if (
      this.importaciones.some(
        (i) =>
          i.huella === importacion.huella &&
          i.idVendedor === importacion.idVendedor,
      )
    ) {
      return Promise.reject(new HuellaDuplicadaError());
    }
    this.importaciones.push(importacion);
    return Promise.resolve();
  }

  buscarPorId(id: string): Promise<Importacion | null> {
    return Promise.resolve(this.importaciones.find((i) => i.id === id) ?? null);
  }

  bloquearPorId(id: string): Promise<Importacion | null> {
    return this.buscarPorId(id);
  }

  buscarPorHuella(
    idVendedor: string,
    huella: string,
  ): Promise<Importacion | null> {
    if (this.ocultarEnLaPrimeraBusqueda) {
      // La subida rival aún no se había guardado cuando se hizo la primera búsqueda.
      this.ocultarEnLaPrimeraBusqueda = false;
      return Promise.resolve(null);
    }
    return Promise.resolve(
      this.importaciones.find(
        (i) => i.huella === huella && i.idVendedor === idVendedor,
      ) ?? null,
    );
  }

  archivarVigentesDeMarca(
    idVendedor: string,
    marcaId: string,
    ahora: Date,
  ): Promise<number> {
    let archivadas = 0;
    this.importaciones = this.importaciones.map((i) => {
      if (
        i.idVendedor === idVendedor &&
        i.marcaId === marcaId &&
        i.estado === 'VIGENTE'
      ) {
        archivadas++;
        return i.archivar(ahora);
      }
      return i;
    });
    return Promise.resolve(archivadas);
  }

  listar(
    filtro: FiltroImportaciones,
    paginacion: Paginacion,
  ): Promise<Pagina<Importacion>> {
    const coincidencias = this.importaciones
      .filter((i) => i.idVendedor === filtro.idVendedor)
      .filter((i) => filtro.estado === undefined || i.estado === filtro.estado)
      .filter((i) => filtro.marcaId === undefined || i.marcaId === filtro.marcaId)
      .toSorted(
        (a, b) =>
          b.creadaEn.getTime() - a.creadaEn.getTime() || b.id.localeCompare(a.id),
      );
    const inicio = desplazamiento(paginacion);
    return Promise.resolve({
      elementos: coincidencias.slice(inicio, inicio + paginacion.tamanio),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total: coincidencias.length,
    });
  }

  listarArchivadas(): Promise<Importacion[]> {
    return Promise.resolve(this.importaciones.filter((i) => i.estaArchivada));
  }

  eliminar(id: string): Promise<boolean> {
    const antes = this.importaciones.length;
    this.importaciones = this.importaciones.filter((i) => i.id !== id);
    return Promise.resolve(this.importaciones.length < antes);
  }
}

export class BorradorRepositorioEnMemoria implements BorradorRepositorio {
  borradores: Borrador[] = [];
  /** Dueño de cada importación (D-60); las que no están aquí son de `ID_VENDEDOR`. */
  private readonly propietarios = new Map<string, string>();

  /** Dice de qué Vendedor es la importación (para probar la propiedad de los borradores). */
  asignarPropietario(idImportacion: string, idVendedor: string): void {
    this.propietarios.set(idImportacion, idVendedor);
  }

  insertarVarios(nuevos: readonly Borrador[]): Promise<void> {
    this.borradores.push(...nuevos);
    return Promise.resolve();
  }

  buscarPorId(id: string, idVendedor: string): Promise<Borrador | null> {
    const borrador = this.borradores.find((b) => b.id === id);
    const dueno = borrador && (this.propietarios.get(borrador.idImportacion) ?? ID_VENDEDOR);
    return Promise.resolve(dueno === idVendedor ? (borrador ?? null) : null);
  }

  bloquearPorId(id: string, idVendedor: string): Promise<Borrador | null> {
    return this.buscarPorId(id, idVendedor);
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

  totales(idImportacion: string): Promise<TotalesBorradores> {
    const propios = this.borradores.filter((b) => b.idImportacion === idImportacion);
    const pendientes = propios.filter((b) => b.estado === 'PENDIENTE');
    return Promise.resolve({
      pendientes: pendientes.length,
      aprobados: propios.filter((b) => b.estado === 'APROBADO').length,
      descartados: propios.filter((b) => b.estado === 'DESCARTADO').length,
      conAdvertencias: pendientes.filter((b) => requiereRevision(b.advertencias)).length,
    });
  }

  listarTodos(filtro: FiltroBorradores): Promise<Borrador[]> {
    return this.listar(filtro, {
      pagina: 1,
      tamanio: Number.MAX_SAFE_INTEGER,
    }).then((pagina) => [...pagina.elementos]);
  }

  pendientesSinCodigo(idImportacion: string): Promise<PendienteSinCodigo[]> {
    return Promise.resolve(
      this.borradores
        .filter(
          (b) =>
            b.idImportacion === idImportacion &&
            b.estado === 'PENDIENTE' &&
            b.codigo === null,
        )
        .map((b) => ({
          marcaId: b.marcaId,
          nombre: b.nombre,
          nombreDudoso: b.advertencias.includes('NOMBRE_DUDOSO'),
        })),
    );
  }

  pendientesPorCodigo(idImportacion: string): Promise<PendientesPorCodigo[]> {
    const grupos = new Map<string, PendientesPorCodigo>();
    for (const b of this.borradores) {
      if (
        b.idImportacion !== idImportacion ||
        b.estado !== 'PENDIENTE' ||
        b.codigo === null
      ) {
        continue;
      }
      const clave = `${b.marcaId}:${b.codigo}`;
      const grupo = grupos.get(clave) ?? {
        marcaId: b.marcaId,
        codigo: b.codigo,
        cantidad: 0,
      };
      grupo.cantidad++;
      grupos.set(clave, grupo);
    }
    return Promise.resolve([...grupos.values()]);
  }

  codigosDeImportacion(idImportacion: string): Promise<string[]> {
    return Promise.resolve([
      ...new Set(
        this.borradores
          .filter((b) => b.idImportacion === idImportacion)
          .flatMap((b) => (b.codigo === null ? [] : [b.codigo])),
      ),
    ]);
  }

  eliminarDeImportacion(idImportacion: string): Promise<number> {
    const antes = this.borradores.length;
    this.borradores = this.borradores.filter((b) => b.idImportacion !== idImportacion);
    return Promise.resolve(antes - this.borradores.length);
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

/** Un producto del catálogo falso, con su marca y su eliminación lógica. */
export interface ProductoFalso {
  id: string;
  idVendedor: string;
  nombre: string;
  /** `null`: producto sin código (se empareja por nombre, D-57). */
  codigo: string | null;
  precio: Dinero;
  marcaId: string;
  disponibilidad: Disponibilidad;
  eliminado: boolean;
}

/**
 * Productos publicados en memoria (puerto `ProductosExistentes`): busca por
 * código dentro de una marca ignorando los eliminados, empareja por nombre los
 * que no tienen código y registra cada actualización de precio.
 */
export class ProductosExistentesFalso implements ProductosExistentes {
  productos: ProductoFalso[] = [];
  /** Cada llamada a `actualizarPrecio`, para comprobar que solo cambia el precio. */
  actualizaciones: Array<{ idProducto: string; precio: string; idVendedor: string }> = [];
  /** Cuántas veces se bloqueó un producto por código o por nombre. */
  bloqueos = 0;

  agregar(
    datos: Partial<ProductoFalso> & { codigo: string | null; marcaId?: string },
  ): ProductoFalso {
    const producto: ProductoFalso = {
      idVendedor: datos.idVendedor ?? ID_VENDEDOR,
      id: datos.id ?? `00000000-0000-4000-8000-${String(700 + this.productos.length).padStart(12, '0')}`,
      nombre: datos.nombre ?? 'Producto existente',
      codigo: datos.codigo,
      precio: datos.precio ?? Dinero.desdeTexto('30.00'),
      marcaId: datos.marcaId ?? ID_MARCA_ACTIVA,
      disponibilidad: datos.disponibilidad ?? 'DISPONIBLE',
      eliminado: datos.eliminado ?? false,
    };
    this.productos.push(producto);
    return producto;
  }

  private vivos(idVendedor: string, marcaId: string): ProductoFalso[] {
    return this.productos.filter(
      (p) =>
        p.idVendedor === idVendedor && p.marcaId === marcaId && !p.eliminado,
    );
  }

  private conCodigo(
    idVendedor: string,
    marcaId: string,
  ): Array<ProductoFalso & { codigo: string }> {
    return this.vivos(idVendedor, marcaId).filter(
      (p): p is ProductoFalso & { codigo: string } => p.codigo !== null,
    );
  }

  buscarPorCodigos(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<ProductoConCodigo[]> {
    return Promise.resolve(
      this.conCodigo(idVendedor, marcaId).filter((p) =>
        codigos.includes(p.codigo),
      ),
    );
  }

  async codigosExistentes(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Set<string>> {
    return new Set(
      (await this.buscarPorCodigos(idVendedor, marcaId, codigos)).map(
        (p) => p.codigo,
      ),
    );
  }

  bloquearPorCodigo(
    idVendedor: string,
    marcaId: string,
    codigo: string,
  ): Promise<ProductoConCodigo | null> {
    this.bloqueos++;
    return Promise.resolve(
      this.conCodigo(idVendedor, marcaId).find((p) => p.codigo === codigo) ??
        null,
    );
  }

  buscarSinCodigoPorNombres(
    idVendedor: string,
    marcaId: string,
    nombres: readonly string[],
  ): Promise<ProductoSinCodigo[]> {
    const claves = nombres.map(claveDeEmparejamiento);
    return Promise.resolve(
      this.vivos(idVendedor, marcaId).filter(
        (p) => p.codigo === null && claves.includes(claveDeEmparejamiento(p.nombre)),
      ),
    );
  }

  bloquearSinCodigoPorNombre(
    idVendedor: string,
    marcaId: string,
    nombre: string,
  ): Promise<ProductoSinCodigo[]> {
    this.bloqueos++;
    return this.buscarSinCodigoPorNombres(idVendedor, marcaId, [nombre]);
  }

  actualizarPrecio(datos: {
    idVendedor: string;
    idProducto: string;
    precio: string;
  }): Promise<void> {
    const producto = this.productos.find((p) => p.id === datos.idProducto);
    if (producto === undefined) {
      return Promise.reject(new Error('El producto no existe.'));
    }
    producto.precio = Dinero.desdeTexto(datos.precio);
    this.actualizaciones.push(datos);
    return Promise.resolve();
  }
  listarAusentes(
    idVendedor: string,
    marcaId: string,
    codigosPresentes: readonly string[],
    paginacion: Paginacion,
  ): Promise<Pagina<ProductoAusente>> {
    const ausentes = this.conCodigo(idVendedor, marcaId)
      .filter((p) => !codigosPresentes.includes(p.codigo))
      .toSorted((a, b) => a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id));
    const inicio = desplazamiento(paginacion);
    return Promise.resolve({
      elementos: ausentes
        .slice(inicio, inicio + paginacion.tamanio)
        .map((p) => ({
          id: p.id,
          nombre: p.nombre,
          codigo: p.codigo,
          precio: p.precio,
          disponibilidad: p.disponibilidad,
        })),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total: ausentes.length,
    });
  }
}

export class CreadorProductosFalso implements CreadorProductos {
  creados: DatosProductoAprobado[] = [];
  /** Nombres que fallan con el error indicado. */
  fallos = new Map<string, ErrorDominio>();
  private contador = 0;

  /**
   * Si se da el catálogo, cada producto creado con código se agrega a él: así
   * un producto creado por una aprobación se ve como «ya existente» en la
   * siguiente (D-57).
   */
  constructor(private readonly catalogo?: ProductosExistentesFalso) {}

  crear(datos: DatosProductoAprobado): Promise<string> {
    const fallo = this.fallos.get(datos.nombre);
    if (fallo !== undefined) {
      return Promise.reject(fallo);
    }
    this.creados.push(datos);
    this.contador++;
    const id = `00000000-0000-4000-8000-${String(900 + this.contador).padStart(12, '0')}`;
    if (this.catalogo !== undefined) {
      this.catalogo.agregar({
        id,
        idVendedor: datos.idVendedor,
        nombre: datos.nombre,
        codigo: datos.codigo,
        marcaId: datos.marcaId,
        precio: Dinero.desdeTexto(datos.precio),
      });
    }
    return Promise.resolve(id);
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
