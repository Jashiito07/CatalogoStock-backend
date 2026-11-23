import type { Reloj } from '../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../auditoria/index.js';
import {
  datosAnonimosDe,
  type ViaEliminacion,
} from '../dominio/cuenta-eliminada.js';
import type { Usuario } from '../dominio/usuario.js';
import type { CodigoRecuperacionRepositorio } from './puertos/codigo-recuperacion.repositorio.js';
import type { GeneradorHash } from './puertos/generador-hash.puerto.js';
import type { GeneradorTokenRenovacion } from './puertos/generador-token-renovacion.puerto.js';
import type { SesionRepositorio } from './puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from './puertos/usuario.repositorio.js';

/**
 * Lo que hace la eliminación de la cuenta, igual por la app y por la web
 * (RF-USU-06, PA-21; contrato cuenta-y-politicas, §1), **en una sola
 * transacción** con la bitácora:
 *
 * 1. Anonimiza nombre, correo y teléfono y reemplaza el hash de la clave por
 *    uno aleatorio; `activo = false` y `eliminado_en`.
 * 2. Revoca todas las sesiones y borra los códigos pendientes.
 * 3. Conserva las filas que referencian al usuario (pedidos, pagos, bitácora).
 * 4. Registra `CUENTA_ELIMINADA` `{ idUsuario, via }` sin nombre, correo ni
 *    teléfono (D-20).
 *
 * El llamador ya comprobó que la cuenta es un Cliente y quién la pide.
 */
export class EliminadorCuenta {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly sesiones: SesionRepositorio,
    private readonly codigos: CodigoRecuperacionRepositorio,
    private readonly generadorHash: GeneradorHash,
    private readonly generadorToken: GeneradorTokenRenovacion,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  /** Devuelve `false` si otra solicitud ya la había eliminado (no registra nada). */
  async eliminar(usuario: Usuario, via: ViaEliminacion): Promise<boolean> {
    const ahora = this.reloj.ahora();
    // Hash de un valor aleatorio que nadie conoce: la clave ya no sirve.
    const hashAleatorio = await this.generadorHash.generar(
      this.generadorToken.generar(),
    );
    return this.unidadTrabajo.ejecutar(async () => {
      const eliminada = await this.usuarios.anonimizarCuenta(
        usuario.id,
        datosAnonimosDe(usuario.id),
        hashAleatorio,
        ahora,
      );
      if (!eliminada) {
        return false;
      }
      await this.sesiones.revocarDeUsuario(usuario.id, ahora);
      await this.codigos.eliminarDeUsuario(usuario.id);
      await this.auditoria.registrar({
        accion: 'CUENTA_ELIMINADA',
        idUsuario: usuario.id,
        entidad: 'USUARIO',
        idEntidad: usuario.id,
        detalle: { idUsuario: usuario.id, via },
      });
      return true;
    });
  }
}
