import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import { rolPermitidoEnCanal } from '../../dominio/canal.js';
import { TokenRenovacionInvalidoError } from '../../dominio/errores-autenticacion.js';
import type { Sesion } from '../../dominio/sesion.js';
import {
  componerSesionEmitida,
  type SesionEmitida,
} from '../dto/sesion-emitida.js';
import type { ConfiguracionSesion } from '../puertos/configuracion-sesion.js';
import type { EmisorTokenAcceso } from '../puertos/emisor-token-acceso.puerto.js';
import type { GeneradorTokenRenovacion } from '../puertos/generador-token-renovacion.puerto.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/**
 * Renovación con rotación (RF-USU-01, D-09).
 *
 * - El token presentado queda revocado y se entrega un par nuevo; la sesión
 *   nueva conserva el usuario, el canal y la familia.
 * - Token inexistente, vencido o revocado, o cuenta inactiva → 401
 *   `TOKEN_INVALIDO`.
 * - **Reutilización:** si llega un token ya rotado (o dos solicitudes usan el
 *   mismo token a la vez), se revoca toda la familia y se responde 401
 *   `TOKEN_INVALIDO`; el usuario debe volver a iniciar sesión.
 */
export class RenovarSesionCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly sesiones: SesionRepositorio,
    private readonly emisorAcceso: EmisorTokenAcceso,
    private readonly generadorToken: GeneradorTokenRenovacion,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly configuracion: ConfiguracionSesion,
  ) {}

  async ejecutar(tokenRenovacion: string): Promise<SesionEmitida> {
    const ahora = this.reloj.ahora();
    const actual = await this.sesiones.buscarPorHashToken(
      this.generadorToken.calcularHash(tokenRenovacion),
    );
    if (actual === null) {
      throw new TokenRenovacionInvalidoError();
    }

    const estado = actual.estadoEn(ahora);
    if (estado === 'REVOCADA') {
      if (actual.fueRotada()) {
        await this.revocarPorReutilizacion(actual, ahora);
      }
      throw new TokenRenovacionInvalidoError();
    }
    if (estado === 'VENCIDA') {
      throw new TokenRenovacionInvalidoError();
    }

    const usuario = await this.usuarios.buscarPorId(actual.idUsuario);
    if (
      usuario === null ||
      !usuario.activo ||
      !rolPermitidoEnCanal(usuario.rol, actual.canal)
    ) {
      throw new TokenRenovacionInvalidoError();
    }

    const nuevoToken = this.generadorToken.generar();
    const siguiente = actual.rotar({
      id: this.generadorId.generar(),
      hashToken: this.generadorToken.calcularHash(nuevoToken),
      ahora,
      vidaDias: this.configuracion.vidaRenovacionDias,
    });
    if (!(await this.sesiones.guardarRotacion(actual, siguiente))) {
      // Otra solicitud rotó este mismo token un instante antes.
      await this.revocarPorReutilizacion(actual, ahora);
      throw new TokenRenovacionInvalidoError();
    }

    const acceso = await this.emisorAcceso.emitir(
      { idUsuario: usuario.id, rol: usuario.rol },
      ahora,
    );
    return componerSesionEmitida(acceso, nuevoToken, siguiente, usuario);
  }

  private async revocarPorReutilizacion(
    sesion: Sesion,
    ahora: Date,
  ): Promise<void> {
    await this.sesiones.revocarFamilia(sesion.familia, 'REUTILIZACION', ahora);
    // PENDIENTE (subfase 1.5): `SESION_REUTILIZACION_DETECTADA` con
    // `{ familiaRevocada: true }`, `idUsuario: sesion.idUsuario`,
    // entidad `SESION` e `idEntidad: sesion.id`.
  }
}
