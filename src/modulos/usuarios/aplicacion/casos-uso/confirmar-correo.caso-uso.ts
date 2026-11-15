import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  CodigoRecuperacionInvalidoError,
  esFormatoCodigoRecuperacion,
  MENSAJE_CODIGO_FORMATO,
  MENSAJE_CODIGO_VERIFICACION_INVALIDO,
  type MotivoRecuperacionFallida,
  PROPOSITOS_VERIFICACION,
} from '../../dominio/codigo-recuperacion.js';
import { errorDeCampo } from '../../dominio/error-campo.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import type { CodigoRecuperacionRepositorio } from '../puertos/codigo-recuperacion.repositorio.js';
import type { ProtectorCodigoRecuperacion } from '../puertos/protector-codigo-recuperacion.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosConfirmarCorreo {
  /** Usuario del token (propiedad: solo verifica su propio correo). */
  idUsuario: string;
  codigo: string;
}

type ResultadoConfirmacion =
  { exito: true } | { exito: false; motivo: MotivoRecuperacionFallida };

/**
 * El usuario con sesión confirma su correo con el código que recibió
 * (contrato de correo, RF-USU-05). Responde 204.
 *
 * Éxito, en una sola transacción: el código queda usado, `correo_verificado_en`
 * se llena y se registra `CORREO_VERIFICADO`.
 *
 * Fallo: siempre el mismo 422 `CODIGO_INVALIDO` (sin código, vencido, usado,
 * agotado o incorrecto). Un código incorrecto suma un intento (al quinto el
 * código queda invalidado) y ese intento se confirma aunque la respuesta sea
 * un error.
 */
export class ConfirmarCorreoCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly codigos: CodigoRecuperacionRepositorio,
    private readonly protector: ProtectorCodigoRecuperacion,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosConfirmarCorreo): Promise<void> {
    // Defensa en profundidad: el DTO ya validó el formato (400).
    if (!esFormatoCodigoRecuperacion(datos.codigo)) {
      throw errorDeCampo('codigo', MENSAJE_CODIGO_FORMATO);
    }
    const usuario = await this.usuarios.buscarPorId(datos.idUsuario);
    if (usuario === null || !usuario.activo) {
      throw new TokenAccesoAusenteError();
    }

    const resultado = await this.unidadTrabajo.ejecutar(
      async (): Promise<ResultadoConfirmacion> => {
        const ahora = this.reloj.ahora();
        const codigo = await this.codigos.buscarUltimoParaActualizar(
          usuario.id,
          PROPOSITOS_VERIFICACION,
        );
        if (codigo === null) {
          return { exito: false, motivo: 'SIN_CODIGO' };
        }
        const motivo = codigo.motivoSiNoVigente(ahora);
        if (motivo !== null) {
          return { exito: false, motivo };
        }
        if (!this.protector.coincide(datos.codigo, codigo.hashCodigo)) {
          // Se confirma con la transacción: se devuelve un resultado en lugar
          // de lanzar el error, que la desharía.
          codigo.registrarIntentoFallido(ahora);
          await this.codigos.guardar(codigo);
          return { exito: false, motivo: 'CODIGO_INCORRECTO' };
        }

        codigo.marcarUsado(ahora);
        await this.codigos.guardar(codigo);
        await this.usuarios.marcarCorreoVerificado(usuario.id, ahora);
        await this.auditoria.registrar({
          accion: 'CORREO_VERIFICADO',
          idUsuario: usuario.id,
          entidad: 'USUARIO',
          idEntidad: usuario.id,
        });
        return { exito: true };
      },
    );

    if (!resultado.exito) {
      throw new CodigoRecuperacionInvalidoError(
        resultado.motivo,
        MENSAJE_CODIGO_VERIFICACION_INVALIDO,
      );
    }
  }
}
