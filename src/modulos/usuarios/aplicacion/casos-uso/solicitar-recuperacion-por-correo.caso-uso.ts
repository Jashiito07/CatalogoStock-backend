import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  CodigoRecuperacion,
  ENVIOS_MAXIMOS_POR_VENTANA,
  inicioVentanaEnvios,
} from '../../dominio/codigo-recuperacion.js';
import { Correo } from '../../dominio/correo.js';
import { crearCorreoCodigo } from '../../dominio/plantilla-correo-codigo.js';
import type { Usuario } from '../../dominio/usuario.js';
import type { CodigoRecuperacionRepositorio } from '../puertos/codigo-recuperacion.repositorio.js';
import type { EnviadorCorreo } from '../puertos/enviador-correo.puerto.js';
import type { ProtectorCodigoRecuperacion } from '../puertos/protector-codigo-recuperacion.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/**
 * Motivo interno por el que una solicitud de código no envió nada (contrato de
 * correo, `SOLICITUD_RECUPERACION_IGNORADA`). Solo va a la bitácora; **nunca**
 * a la respuesta.
 */
export type MotivoSolicitudIgnorada =
  | 'NO_EXISTE'
  | 'CUENTA_INACTIVA'
  | 'CORREO_NO_VERIFICADO'
  | 'LIMITE_HORARIO';

export interface ResultadoSolicitudRecuperacion {
  /**
   * El envío del correo, que sigue en segundo plano para que la respuesta
   * tarde lo mismo exista o no la cuenta. **Nunca rechaza**: si el servicio de
   * correo falla, el error se descarta (el adaptador ya lo registró sin datos
   * personales). Solo las pruebas esperan esta promesa.
   */
  envio: Promise<void>;
}

/**
 * Solicitud pública de un código de recuperación por correo (contrato de
 * correo, RF-USU-05). La respuesta HTTP es **siempre 204**, exista o no la
 * cuenta, para no revelar qué correos están registrados.
 *
 * - Solo si la cuenta existe, está activa y tiene el correo verificado se
 *   genera un código (RECUPERACION_CORREO) y se envía **al correo registrado**.
 * - Máximo 3 envíos por hora y por cuenta: el cuarto no envía nada y se
 *   registra `SOLICITUD_RECUPERACION_IGNORADA` (motivo `LIMITE_HORARIO`).
 * - Bitácora: `CODIGO_CORREO_ENVIADO` en la misma transacción que guarda el
 *   código, o `SOLICITUD_RECUPERACION_IGNORADA` (con el correo intentado,
 *   D-20, y el motivo interno). Nunca el código.
 * - Un fallo del servicio de correo no cambia la respuesta ni filtra detalles.
 */
export class SolicitarRecuperacionPorCorreoCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly codigos: CodigoRecuperacionRepositorio,
    private readonly protector: ProtectorCodigoRecuperacion,
    private readonly enviador: EnviadorCorreo,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(correoIntentado: string): Promise<ResultadoSolicitudRecuperacion> {
    const cuenta = await this.buscarCuenta(correoIntentado);
    const motivo = this.motivoParaIgnorar(cuenta);
    if (cuenta === null || motivo !== null) {
      await this.ignorar(correoIntentado, cuenta, motivo ?? 'NO_EXISTE');
      return { envio: Promise.resolve() };
    }

    const ahora = this.reloj.ahora();
    const codigo = this.protector.generar();
    const registro = CodigoRecuperacion.generar({
      id: this.generadorId.generar(),
      idUsuario: cuenta.id,
      hashCodigo: this.protector.calcularHash(codigo),
      proposito: 'RECUPERACION_CORREO',
      generadoPor: null,
      ahora,
    });

    const emitido = await this.unidadTrabajo.ejecutar(async () => {
      const resultado = await this.codigos.emitir(registro, ahora, {
        desde: inicioVentanaEnvios(ahora),
        maximo: ENVIOS_MAXIMOS_POR_VENTANA,
      });
      if (!resultado.emitido) {
        return false;
      }
      await this.auditoria.registrar({
        accion: 'CODIGO_CORREO_ENVIADO',
        idUsuario: cuenta.id,
        entidad: 'USUARIO',
        idEntidad: cuenta.id,
        detalle: {
          correo: cuenta.correo.valor,
          proposito: 'RECUPERACION_CORREO',
          venceEn: registro.venceEn.toISOString(),
        },
      });
      return true;
    });
    if (!emitido) {
      await this.ignorar(correoIntentado, cuenta, 'LIMITE_HORARIO');
      return { envio: Promise.resolve() };
    }

    // Siempre al correo registrado de la cuenta, nunca al que escribió quien solicita.
    return { envio: this.enviar(cuenta.correo.valor, codigo) };
  }

  /** Un correo con formato inválido se trata como inexistente (misma respuesta 204). */
  private async buscarCuenta(correo: string): Promise<Usuario | null> {
    let normalizado: Correo;
    try {
      normalizado = Correo.crear(correo);
    } catch {
      return null;
    }
    return this.usuarios.buscarPorCorreo(normalizado);
  }

  private motivoParaIgnorar(cuenta: Usuario | null): MotivoSolicitudIgnorada | null {
    if (cuenta === null) {
      return 'NO_EXISTE';
    }
    if (!cuenta.activo) {
      return 'CUENTA_INACTIVA';
    }
    if (!cuenta.tieneCorreoVerificado()) {
      return 'CORREO_NO_VERIFICADO';
    }
    return null;
  }

  /** `SOLICITUD_RECUPERACION_IGNORADA`: sin interrumpir, la respuesta sigue siendo 204. */
  private async ignorar(
    correoIntentado: string,
    cuenta: Usuario | null,
    motivo: MotivoSolicitudIgnorada,
  ): Promise<void> {
    const idCuenta = cuenta?.id ?? null;
    await this.auditoria.registrarSinInterrumpir({
      accion: 'SOLICITUD_RECUPERACION_IGNORADA',
      idUsuario: idCuenta,
      entidad: 'USUARIO',
      idEntidad: idCuenta,
      detalle: { correo: correoIntentado, motivo },
    });
  }

  /** Envía el correo y descarta cualquier error: la respuesta pública no depende del servicio de correo. */
  private async enviar(para: string, codigo: string): Promise<void> {
    try {
      await this.enviador.enviar({
        para,
        ...crearCorreoCodigo('RECUPERACION', codigo),
      });
    } catch {
      // El adaptador ya registró el fallo (sin correo ni código).
    }
  }
}
