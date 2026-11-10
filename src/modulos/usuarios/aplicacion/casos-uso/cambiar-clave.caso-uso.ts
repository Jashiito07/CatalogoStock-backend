import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  ClaveActualIncorrectaError,
  exigirClaveNuevaDistinta,
  validarClaveNueva,
} from '../../dominio/cambio-clave.js';
import { BYTES_MAXIMOS_CLAVE, bytesUtf8 } from '../../dominio/clave.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { GeneradorTokenRenovacion } from '../puertos/generador-token-renovacion.puerto.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosCambiarClave {
  /** Usuario del token de acceso (propiedad: solo su propia clave). */
  idUsuario: string;
  claveActual: string;
  claveNueva: string;
  /** Token de renovación de la sesión que se conserva; sin él se revocan todas. */
  tokenRenovacionActual?: string;
}

/**
 * Cambio de clave con la sesión iniciada (RF-USU-05, observación 7; Cliente
 * o Vendedor).
 *
 * - 400 si la clave nueva no cumple las reglas o es igual a la actual.
 * - 422 `CLAVE_ACTUAL_INCORRECTA` si la clave actual no coincide.
 * - Una cuenta que ya no existe o está inactiva responde 401, como
 *   `GET /usuarios/yo` (D-28).
 * - En una sola transacción: hash nuevo, revocación de **las demás**
 *   sesiones (se conserva la familia de `tokenRenovacionActual` si es una
 *   sesión vigente del mismo usuario) y `CLAVE_CAMBIADA`.
 */
export class CambiarClaveCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly sesiones: SesionRepositorio,
    private readonly generadorHash: GeneradorHash,
    private readonly generadorToken: GeneradorTokenRenovacion,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosCambiarClave): Promise<void> {
    const claveNueva = validarClaveNueva(datos.claveNueva);
    exigirClaveNuevaDistinta(datos.claveActual, claveNueva);

    const usuario = await this.usuarios.buscarPorId(datos.idUsuario);
    if (!usuario?.activo) {
      throw new TokenAccesoAusenteError();
    }
    const coincide =
      bytesUtf8(datos.claveActual) <= BYTES_MAXIMOS_CLAVE &&
      (await this.generadorHash.comparar(datos.claveActual, usuario.hashClave));
    if (!coincide) {
      throw new ClaveActualIncorrectaError();
    }

    const ahora = this.reloj.ahora();
    const familiaConservada = await this.familiaActual(
      datos.idUsuario,
      datos.tokenRenovacionActual,
      ahora,
    );
    const hashClave = await this.generadorHash.generar(claveNueva);

    await this.unidadTrabajo.ejecutar(async () => {
      await this.usuarios.actualizarClave(usuario.id, hashClave, ahora);
      const sesionesRevocadas = await this.sesiones.revocarDeUsuario(
        usuario.id,
        ahora,
        familiaConservada,
      );
      await this.auditoria.registrar({
        accion: 'CLAVE_CAMBIADA',
        idUsuario: usuario.id,
        entidad: 'USUARIO',
        idEntidad: usuario.id,
        detalle: { sesionesRevocadas },
      });
    });
  }

  /**
   * Familia de la sesión que se conserva. Un token desconocido, vencido,
   * revocado o de otro usuario no conserva nada: se revocan todas.
   */
  private async familiaActual(
    idUsuario: string,
    token: string | undefined,
    ahora: Date,
  ): Promise<string | undefined> {
    if (token === undefined || token.length === 0) {
      return undefined;
    }
    const sesion = await this.sesiones.buscarPorHashToken(
      this.generadorToken.calcularHash(token),
    );
    if (
      sesion === null ||
      !sesion.perteneceA(idUsuario) ||
      sesion.estadoEn(ahora) !== 'VIGENTE'
    ) {
      return undefined;
    }
    return sesion.familia;
  }
}
