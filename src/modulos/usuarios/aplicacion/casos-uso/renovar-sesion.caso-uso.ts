import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
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
 *   `TOKEN_INVALIDO`; el usuario debe volver a iniciar sesión. La revocación
 *   se confirma siempre; `SESION_REUTILIZACION_DETECTADA` se registra
 *   después y sin interrumpir (decisión del usuario, 1.5).
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
    private readonly auditoria: ServicioAuditoria,
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
    // Decisión del usuario (1.5): la revocación se confirma SIEMPRE, aunque
    // la bitácora falle. El registro va después, fuera de la transacción y
    // sin interrumpir: la respuesta sigue siendo 401 TOKEN_INVALIDO. Si la
    // familia ya estaba revocada (el mismo token viejo presentado otra vez),
    // no cambia nada y no se registra de nuevo.
    const revocadas = await this.sesiones.revocarFamilia(
      sesion.familia,
      'REUTILIZACION',
      ahora,
    );
    if (revocadas > 0) {
      await this.auditoria.registrarSinInterrumpir({
        accion: 'SESION_REUTILIZACION_DETECTADA',
        idUsuario: sesion.idUsuario,
        entidad: 'SESION',
        idEntidad: sesion.id,
        detalle: { familiaRevocada: true },
      });
    }
  }
}
