import {
  desplazamiento,
  type Pagina,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { type AccionRevision, cumpleAccion } from '../../dominio/accion-revision.js';
import type { BorradorPublico, EstadoBorrador } from '../../dominio/borrador.js';
import { ImportacionNoEncontradaError } from '../../dominio/errores-importacion.js';
import { emparejarBorradores } from '../productos-de-borradores.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { ImportacionRepositorio } from '../puertos/importacion.repositorio.js';
import type { ProductosExistentes } from '../puertos/productos-existentes.puerto.js';

export interface ConsultaBorradores {
  idImportacion: string;
  /** Por defecto `PENDIENTE`. */
  estado?: EstadoBorrador;
  conAdvertencias?: boolean;
  /** Ya convertida a clave sin tildes ni mayúsculas; cubre el nombre y el código. */
  clave?: string;
  paginaPdf?: number;
  /** `ACTUALIZAR`, `NUEVO` o `CAMBIO_PRECIO` (D-57); solo los pendientes cumplen alguna. */
  accion?: AccionRevision;
  paginacion: Paginacion;
}

/**
 * `GET /productos/importaciones/{id}/borradores` (RF-PRO-01): lista paginada
 * por página del PDF y posición, con filtros de estado, advertencias, texto
 * (nombre o código), página del PDF y `accion` (D-57). 404 si la importación
 * no existe. Cada borrador pendiente trae `productoExistente` si se empareja
 * con un producto: por código, o, sin código, por nombre exacto con un único
 * producto sin código de la marca (D-57).
 *
 * `accion` depende de los productos publicados, así que con ese filtro se
 * emparejan todos los borradores que pasan los demás filtros y la página se
 * corta después, en el servidor: `total` y las páginas son siempre correctos.
 */
export class ListarBorradoresCasoUso {
  constructor(
    private readonly importaciones: ImportacionRepositorio,
    private readonly borradores: BorradorRepositorio,
    private readonly productos: ProductosExistentes,
  ) {}

  async ejecutar(consulta: ConsultaBorradores): Promise<Pagina<BorradorPublico>> {
    const importacion = await this.importaciones.buscarPorId(
      consulta.idImportacion,
    );
    if (importacion === null) {
      throw new ImportacionNoEncontradaError();
    }
    const filtro = {
      idImportacion: importacion.id,
      estado: consulta.estado ?? 'PENDIENTE',
      conAdvertencias: consulta.conAdvertencias,
      clave: consulta.clave,
      paginaPdf: consulta.paginaPdf,
    } as const;

    if (consulta.accion === undefined) {
      const pagina = await this.borradores.listar(filtro, consulta.paginacion);
      const emparejados = await emparejarBorradores(pagina.elementos, this.productos);
      return {
        ...pagina,
        elementos: pagina.elementos.map((borrador) => {
          const e = emparejados.get(borrador.id);
          return borrador.aPublico(e?.existente ?? null, e?.ambiguo ?? false);
        }),
      };
    }

    const todos = await this.borradores.listarTodos(filtro);
    const emparejados = await emparejarBorradores(todos, this.productos);
    const accion = consulta.accion;
    const coinciden = todos.filter((borrador) =>
      cumpleAccion(accion, borrador, emparejados.get(borrador.id)?.existente ?? null),
    );
    const inicio = desplazamiento(consulta.paginacion);
    return {
      elementos: coinciden
        .slice(inicio, inicio + consulta.paginacion.tamanio)
        .map((borrador) => {
          const e = emparejados.get(borrador.id);
          return borrador.aPublico(e?.existente ?? null, e?.ambiguo ?? false);
        }),
      pagina: consulta.paginacion.pagina,
      tamanio: consulta.paginacion.tamanio,
      total: coinciden.length,
    };
  }
}
