import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  CodigoRecuperacion,
  ENVIOS_MAXIMOS_POR_VENTANA,
  inicioVentanaEnvios,
} from '../../dominio/codigo-recuperacion.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import {
  CorreoYaVerificadoError,
  DemasiadosEnviosCodigoError,
} from '../../dominio/errores-correo.js';
import { crearCorreoCodigo } from '../../dominio/plantilla-correo-codigo.js';
import type { CodigoRecuperacionRepositorio } from '../puertos/codigo-recuperacion.repositorio.js';
import type { EnviadorCorreo } from '../puertos/enviador-correo.puerto.js';
import type { ProtectorCodigoRecuperacion } from '../puertos/protector-codigo-recuperacion.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/**
 * El usuario con sesión pide un código para verificar su correo (contrato de
 * correo, RF-USU-05). Responde 204.
 *
 * - El código se envía solo al correo **registrado** de la cuenta del token.
 * - Máximo 3 envíos por hora y por cuenta → 429 `DEMASIADAS_SOLICITUDES`.
 * - Un correo ya verificado → 409 `CORREO_YA_VERIFICADO`.
 * - El código se guarda con su `CODIGO_CORREO_ENVIADO` y se envía **dentro de
 *   la misma transacción**: si el servicio de correo falla (503
 *   `CORREO_NO_DISPONIBLE`) no queda ni el código ni el registro, no se gasta
 *   un envío del límite y se puede reintentar.
 * - Nunca se registra el código ni el cuerpo del correo.
 */
export class SolicitarVerificacionCorreoCasoUso {
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

  async ejecutar(idUsuario: string): Promise<void> {
    const usuario = await this.usuarios.buscarPorId(idUsuario);
    if (usuario === null || !usuario.activo) {
      throw new TokenAccesoAusenteError();
    }
    if (usuario.tieneCorreoVerificado()) {
      throw new CorreoYaVerificadoError();
    }

    const ahora = this.reloj.ahora();
    const codigo = this.protector.generar();
    const registro = CodigoRecuperacion.generar({
      id: this.generadorId.generar(),
      idUsuario: usuario.id,
      hashCodigo: this.protector.calcularHash(codigo),
      proposito: 'VERIFICACION_CORREO',
      generadoPor: null,
      ahora,
    });

    await this.unidadTrabajo.ejecutar(async () => {
      const resultado = await this.codigos.emitir(registro, ahora, {
        desde: inicioVentanaEnvios(ahora),
        maximo: ENVIOS_MAXIMOS_POR_VENTANA,
      });
      if (!resultado.emitido) {
        const espera = resultado.disponibleEn.getTime() - ahora.getTime();
        throw new DemasiadosEnviosCodigoError(
          Math.max(1, Math.ceil(espera / 1000)),
        );
      }
      await this.auditoria.registrar({
        accion: 'CODIGO_CORREO_ENVIADO',
        idUsuario: usuario.id,
        entidad: 'USUARIO',
        idEntidad: usuario.id,
        detalle: {
          proposito: 'VERIFICACION_CORREO',
          venceEn: registro.venceEn.toISOString(),
        },
      });
      await this.enviador.enviar({
        para: usuario.correo.valor,
        ...crearCorreoCodigo('VERIFICACION', codigo),
      });
    });
  }
}
