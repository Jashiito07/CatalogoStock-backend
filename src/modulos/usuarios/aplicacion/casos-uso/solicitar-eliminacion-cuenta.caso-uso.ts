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
import type { ResultadoSolicitudRecuperacion } from './solicitar-recuperacion-por-correo.caso-uso.js';

/** Motivo interno (solo bitácora) por el que no se envió el código. */
export type MotivoEliminacionIgnorada =
  | 'NO_EXISTE'
  | 'CUENTA_INACTIVA'
  | 'NO_ES_CLIENTE'
  | 'CORREO_NO_VERIFICADO'
  | 'LIMITE_HORARIO';

/**
 * `POST /autenticacion/eliminacion/solicitud` (RF-USU-06, PA-21): pide por la
 * web un código para eliminar la cuenta. **Siempre 204**, exista o no la
 * cuenta (misma duración: el correo sigue en segundo plano).
 *
 * Solo si la cuenta existe, es **Cliente**, está activa, no está eliminada y
 * tiene el correo verificado se genera un código `ELIMINACION_CUENTA` y se
 * envía **solo a su correo registrado**; mismas reglas que la recuperación por
 * correo (hash, 15 minutos, una vez, 5 intentos, uno vigente) y 3 envíos por
 * hora y cuenta. Bitácora: `CODIGO_CORREO_ENVIADO` o
 * `SOLICITUD_RECUPERACION_IGNORADA` con el motivo interno; nunca el código.
 */
export class SolicitarEliminacionCuentaCasoUso {
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
      proposito: 'ELIMINACION_CUENTA',
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
          proposito: 'ELIMINACION_CUENTA',
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

  private async buscarCuenta(correo: string): Promise<Usuario | null> {
    let normalizado: Correo;
    try {
      normalizado = Correo.crear(correo);
    } catch {
      return null;
    }
    return this.usuarios.buscarPorCorreo(normalizado);
  }

  private motivoParaIgnorar(
    cuenta: Usuario | null,
  ): MotivoEliminacionIgnorada | null {
    if (cuenta === null) {
      return 'NO_EXISTE';
    }
    if (!cuenta.esCliente()) {
      return 'NO_ES_CLIENTE';
    }
    if (!cuenta.activo || cuenta.estaEliminada()) {
      return 'CUENTA_INACTIVA';
    }
    if (!cuenta.tieneCorreoVerificado()) {
      return 'CORREO_NO_VERIFICADO';
    }
    return null;
  }

  private async ignorar(
    correoIntentado: string,
    cuenta: Usuario | null,
    motivo: MotivoEliminacionIgnorada,
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

  private async enviar(para: string, codigo: string): Promise<void> {
    try {
      await this.enviador.enviar({
        para,
        ...crearCorreoCodigo('ELIMINACION', codigo),
      });
    } catch {
      // El adaptador ya registró el fallo (sin correo ni código).
    }
  }
}
