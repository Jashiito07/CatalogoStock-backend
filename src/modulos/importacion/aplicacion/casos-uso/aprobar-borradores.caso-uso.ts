import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { ErrorDominio } from '../../../../compartido/dominio/errores.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import type { EmparejadoPor } from '../../dominio/advertencias.js';
import type { Dinero } from '../../../../compartido/dominio/dinero.js';
import type { Borrador } from '../../dominio/borrador.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { CreadorProductos } from '../puertos/creador-productos.puerto.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type { ProductosExistentes } from '../puertos/productos-existentes.puerto.js';

export type ErrorResultadoBorrador =
  | 'SIN_PRECIO'
  /** `PRECIO_HEREDADO` sin confirmar por el Vendedor. */
  | 'PRECIO_NO_CONFIRMADO'
  | 'MARCA_INACTIVA'
  | 'NO_PENDIENTE'
  | 'NO_ENCONTRADO'
  /** El producto no pasó una validación del alta (no debería ocurrir con datos ya validados). */
  | 'DATOS_INVALIDOS';

/** Qué se hizo con el producto al aprobar el borrador (D-57). */
export type AccionAprobacion = 'CREADO' | 'ACTUALIZADO' | 'SIN_CAMBIO';

export type ResultadoAprobacion =
  | {
      id: string;
      estado: 'APROBADO';
      idProducto: string;
      accion: AccionAprobacion;
      /** Cómo se encontró el producto actualizado (`CODIGO` o `NOMBRE`); `null` si se creó (D-57). */
      emparejadoPor: EmparejadoPor | null;
    }
  | { id: string; error: ErrorResultadoBorrador };

export interface DatosAprobarBorradores {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  ids: readonly string[];
}

/** Una carrera por el mismo código (dos aprobaciones que crean a la vez) se reintenta una vez. */
const INTENTOS_POR_BORRADOR = 2;

/**
 * `POST /productos/importaciones/borradores/aprobar` (RF-PRO-01, RN-11, D-57,
 * PA-07). Por cada borrador `PENDIENTE` aprobable, **en una transacción por
 * borrador** (un fallo no deshace los demás):
 *
 * - Si en la marca del borrador ya hay un producto no eliminado con su código (o, sin código y sin nombre dudoso,
 *   exactamente uno sin código con el mismo nombre sin distinguir mayúsculas, tildes ni signos),
 *   se actualiza **solo el precio** (nombre, descripción, imágenes y
 *   disponibilidad, que el Vendedor pudo editar, no se tocan) con el
 *   `PRODUCTO_ACTUALIZADO` habitual (`precioAnterior`, `precioNuevo`); si el
 *   precio es igual no se escribe nada (`SIN_CAMBIO`).
 * - Si no hay (o el borrador no tiene código), se crea el producto con las
 *   mismas validaciones y la misma bitácora (`PRODUCTO_CREADO`) que `POST
 *   /productos`, con su `codigo` (`CREADO`).
 *
 * El borrador se bloquea (`FOR UPDATE`), así que aprobar dos veces, aun en
 * paralelo, actúa una sola vez y la segunda responde `NO_PENDIENTE`; el
 * producto del código también se bloquea, y si dos aprobaciones crean a la vez
 * el mismo código, la perdedora se reintenta y entonces actualiza. Al terminar
 * registra `BORRADORES_APROBADOS` por cada importación afectada.
 */
export class AprobarBorradoresCasoUso {
  constructor(
    private readonly borradores: BorradorRepositorio,
    private readonly productos: CreadorProductos,
    private readonly existentes: ProductosExistentes,
    private readonly marcas: DirectorioMarcas,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(
    datos: DatosAprobarBorradores,
  ): Promise<ResultadoAprobacion[]> {
    const resultados: ResultadoAprobacion[] = [];
    const aprobadosPorImportacion = new Map<string, number>();
    for (const id of datos.ids) {
      const { resultado, idImportacion } = await this.aprobarUno(
        id,
        datos.idVendedor,
      );
      resultados.push(resultado);
      if (idImportacion !== null) {
        aprobadosPorImportacion.set(
          idImportacion,
          (aprobadosPorImportacion.get(idImportacion) ?? 0) + 1,
        );
      }
    }
    for (const [idImportacion, cantidad] of aprobadosPorImportacion) {
      await this.unidadTrabajo.ejecutar(() =>
        this.auditoria.registrar({
          accion: 'BORRADORES_APROBADOS',
          idUsuario: datos.idVendedor,
          entidad: 'IMPORTACION',
          idEntidad: idImportacion,
          detalle: { idImportacion, cantidad },
        }),
      );
    }
    return resultados;
  }

  private async aprobarUno(
    id: string,
    idVendedor: string,
  ): Promise<{ resultado: ResultadoAprobacion; idImportacion: string | null }> {
    const fallo = (error: ErrorResultadoBorrador) => ({
      resultado: { id, error } satisfies ResultadoAprobacion,
      idImportacion: null,
    });
    for (let intento = 1; ; intento++) {
      try {
        return await this.unidadTrabajo.ejecutar(async () => {
          // D-60: un borrador de otro Vendedor es `NO_ENCONTRADO`.
          const borrador = await this.borradores.bloquearPorId(id, idVendedor);
          if (borrador === null) {
            return fallo('NO_ENCONTRADO');
          }
          if (!borrador.esPendiente) {
            return fallo('NO_PENDIENTE');
          }
          if (borrador.precio === null) {
            return fallo('SIN_PRECIO');
          }
          // PRECIO_HEREDADO: el precio vino de la ficha; el Vendedor debe confirmarlo
          // (PATCH con `precio`) antes de aprobar. Ninguna aprobación en bloque lo omite.
          if (borrador.precioHeredado) {
            return fallo('PRECIO_NO_CONFIRMADO');
          }
          const marca = await this.marcas.buscarPorId(borrador.marcaId);
          if (marca === null || !marca.activa) {
            return fallo('MARCA_INACTIVA');
          }
          const { idProducto, accion, emparejadoPor } = await this.aplicarAlProducto(
            borrador,
            borrador.precio.aTexto(),
            idVendedor,
          );
          await this.borradores.guardar(
            borrador.aprobar(idProducto, this.reloj.ahora()),
          );
          return {
            resultado: {
              id,
              estado: 'APROBADO',
              idProducto,
              accion,
              emparejadoPor,
            } satisfies ResultadoAprobacion,
            idImportacion: borrador.idImportacion,
          };
        });
      } catch (error) {
        // La transacción de este borrador ya se deshizo; los demás no se tocan.
        if (error instanceof ErrorDominio) {
          if (
            error.codigo === 'CODIGO_DUPLICADO' &&
            intento < INTENTOS_POR_BORRADOR
          ) {
            // Otra aprobación creó el mismo código a la vez: ahora existe y se actualizará.
            continue;
          }
          if (error.codigo === 'MARCA_INACTIVA') {
            return fallo('MARCA_INACTIVA');
          }
          if (
            error.codigo === 'DATOS_INVALIDOS' ||
            error.codigo === 'NO_ENCONTRADO'
          ) {
            return fallo('DATOS_INVALIDOS');
          }
        }
        throw error;
      }
    }
  }

  /**
   * Busca el producto que el borrador actualiza (D-57): por código si lo tiene
   * o, sin código y sin nombre dudoso, por nombre exacto con **un único**
   * producto sin código de la marca. Bloquea lo que encuentra. Si no hay (o
   * hay varios con ese nombre), devuelve `null` y se crea uno nuevo.
   */
  private async buscarExistente(
    borrador: Borrador,
    idVendedor: string,
  ): Promise<{ id: string; precio: Dinero; por: EmparejadoPor } | null> {
    if (borrador.codigo !== null) {
      const porCodigo = await this.existentes.bloquearPorCodigo(
        idVendedor,
        borrador.marcaId,
        borrador.codigo,
      );
      return porCodigo === null
        ? null
        : { id: porCodigo.id, precio: porCodigo.precio, por: 'CODIGO' };
    }
    if (!borrador.puedeEmparejarPorNombre) {
      return null;
    }
    const porNombre = await this.existentes.bloquearSinCodigoPorNombre(
      idVendedor,
      borrador.marcaId,
      borrador.nombre,
    );
    return porNombre.length === 1
      ? { id: porNombre[0].id, precio: porNombre[0].precio, por: 'NOMBRE' }
      : null;
  }

  /** Actualiza el precio del producto emparejado o crea uno nuevo (D-57). */
  private async aplicarAlProducto(
    borrador: Borrador,
    precio: string,
    idVendedor: string,
  ): Promise<{
    idProducto: string;
    accion: AccionAprobacion;
    emparejadoPor: EmparejadoPor | null;
  }> {
    const existente = await this.buscarExistente(borrador, idVendedor);
    if (existente !== null) {
      if (existente.precio.aTexto() === precio) {
        return {
          idProducto: existente.id,
          accion: 'SIN_CAMBIO',
          emparejadoPor: existente.por,
        };
      }
      await this.existentes.actualizarPrecio({
        idVendedor,
        idProducto: existente.id,
        precio,
      });
      return {
        idProducto: existente.id,
        accion: 'ACTUALIZADO',
        emparejadoPor: existente.por,
      };
    }
    const idProducto = await this.productos.crear({
      idVendedor,
      nombre: borrador.nombre,
      codigo: borrador.codigo,
      marcaId: borrador.marcaId,
      precio,
      descripcion: borrador.descripcionParaProducto(),
      disponibilidad: borrador.disponibilidad,
    });
    return { idProducto, accion: 'CREADO', emparejadoPor: null };
  }
}
