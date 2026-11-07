import type {
  Pagina,
  Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type {
  AccionAuditoria,
  EntidadAuditoria,
} from '../../dominio/catalogo-auditoria.js';
import type { DetalleAuditoria } from '../../dominio/detalle-auditoria.js';
import {
  type FiltrosBitacora,
  validarFiltrosBitacora,
} from '../../dominio/filtros-bitacora.js';
import type { DirectorioUsuarios } from '../puertos/directorio-usuarios.puerto.js';
import type { RegistroActividadRepositorio } from '../puertos/registro-actividad.repositorio.js';

/** Contrato: si el usuario se elimina en el futuro, se muestra este nombre. */
export const NOMBRE_USUARIO_ELIMINADO = 'Usuario eliminado';

export interface UsuarioDeActividad {
  id: string;
  nombre: string;
  /** `null` solo si el usuario ya no existe. */
  rol: string | null;
}

export interface ActividadConsultada {
  id: string;
  fecha: Date;
  accion: AccionAuditoria;
  usuario: UsuarioDeActividad | null;
  entidad: EntidadAuditoria | null;
  idEntidad: string | null;
  detalle: DetalleAuditoria;
}

/**
 * `GET /auditoria` (RF-USU-04, RF-USU-03, CA-02). Solo el Vendedor llega
 * aquí: lo comprueba `@Roles('VENDEDOR')` en el controlador.
 *
 * El nombre y el rol de cada usuario se obtienen al consultar mediante el
 * servicio público de `usuarios` (una sola búsqueda por página).
 */
export class ConsultarBitacoraCasoUso {
  constructor(
    private readonly registros: RegistroActividadRepositorio,
    private readonly directorio: DirectorioUsuarios,
  ) {}

  async ejecutar(
    filtros: FiltrosBitacora,
    paginacion: Paginacion,
  ): Promise<Pagina<ActividadConsultada>> {
    const { registros, total } = await this.registros.consultar(
      validarFiltrosBitacora(filtros),
      paginacion,
    );

    const ids = [
      ...new Set(
        registros.flatMap((registro) =>
          registro.idUsuario === null ? [] : [registro.idUsuario],
        ),
      ),
    ];
    const resumenes =
      ids.length === 0 ? [] : await this.directorio.buscarResumenes(ids);
    const porId = new Map(resumenes.map((resumen) => [resumen.id, resumen]));

    return {
      elementos: registros.map((registro) => {
        const idUsuario = registro.idUsuario;
        const resumen = idUsuario === null ? undefined : porId.get(idUsuario);
        let usuario: UsuarioDeActividad | null = null;
        if (idUsuario !== null) {
          usuario = resumen
            ? { id: resumen.id, nombre: resumen.nombre, rol: resumen.rol }
            : { id: idUsuario, nombre: NOMBRE_USUARIO_ELIMINADO, rol: null };
        }
        return {
          id: registro.id,
          fecha: registro.fecha,
          accion: registro.accion,
          usuario,
          entidad: registro.entidad,
          idEntidad: registro.idEntidad,
          detalle: registro.detalle,
        };
      }),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total,
    };
  }
}
