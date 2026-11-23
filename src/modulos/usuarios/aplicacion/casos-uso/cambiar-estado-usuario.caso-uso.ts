import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  OperacionNoPermitidaError,
  UsuarioNoEncontradoError,
} from '../../dominio/errores-usuario.js';
import type { UsuarioPublico } from '../../dominio/usuario.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosCambiarEstadoUsuario {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idUsuario: string;
  /** `false` desactiva; `true` reactiva. */
  activo: boolean;
}

/**
 * Desactivar o reactivar la cuenta de un Cliente (D-53, RF-USU-03).
 *
 * - No hay borrado: la cuenta y sus pedidos se conservan.
 * - Un id inexistente responde 404 `USUARIO_NO_ENCONTRADO`; el Vendedor no se
 *   puede desactivar (422 `OPERACION_NO_PERMITIDA`).
 * - Desactivar revoca todas las sesiones del Cliente y registra
 *   `CLIENTE_DESACTIVADO`; reactivar registra `CLIENTE_REACTIVADO`. El
 *   detalle de la bitácora es solo `{ idUsuario }` (D-20).
 * - El cambio, la revocación y la bitácora van en una sola transacción.
 * - Idempotente: si la cuenta ya está en ese estado responde igual, sin
 *   escribir ni registrar (el `UPDATE` condicional evita registrar dos veces
 *   si dos solicitudes coinciden).
 */
export class CambiarEstadoUsuarioCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly sesiones: SesionRepositorio,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosCambiarEstadoUsuario): Promise<UsuarioPublico> {
    const usuario = await this.usuarios.buscarPorId(datos.idUsuario);
    // RF-USU-06: una cuenta eliminada no se puede reactivar; es como si no existiera.
    if (usuario === null || usuario.estaEliminada()) {
      throw new UsuarioNoEncontradoError();
    }
    if (usuario.esVendedor()) {
      throw new OperacionNoPermitidaError();
    }
    if (usuario.activo === datos.activo) {
      return usuario.aPublico();
    }

    const ahora = this.reloj.ahora();
    await this.unidadTrabajo.ejecutar(async () => {
      const cambio = await this.usuarios.actualizarActivo(
        usuario.id,
        datos.activo,
        ahora,
      );
      if (!cambio) {
        return;
      }
      if (!datos.activo) {
        await this.sesiones.revocarDeUsuario(usuario.id, ahora);
      }
      await this.auditoria.registrar({
        accion: datos.activo ? 'CLIENTE_REACTIVADO' : 'CLIENTE_DESACTIVADO',
        idUsuario: datos.idVendedor,
        entidad: 'USUARIO',
        idEntidad: usuario.id,
        detalle: { idUsuario: usuario.id },
      });
    });

    const actualizado = await this.usuarios.buscarPorId(usuario.id);
    if (actualizado === null) {
      throw new UsuarioNoEncontradoError();
    }
    return actualizado.aPublico();
  }
}
