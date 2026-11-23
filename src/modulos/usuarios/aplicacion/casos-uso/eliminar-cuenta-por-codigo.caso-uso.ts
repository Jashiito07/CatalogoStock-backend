import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import {
  CodigoRecuperacionInvalidoError,
  esFormatoCodigoRecuperacion,
  MENSAJE_CODIGO_ELIMINACION_INVALIDO,
  MENSAJE_CODIGO_FORMATO,
  type MotivoRecuperacionFallida,
  PROPOSITOS_ELIMINACION,
} from '../../dominio/codigo-recuperacion.js';
import { Correo } from '../../dominio/correo.js';
import { errorDeCampo } from '../../dominio/error-campo.js';
import type { Usuario } from '../../dominio/usuario.js';
import type { EliminadorCuenta } from '../eliminador-cuenta.js';
import type { CodigoRecuperacionRepositorio } from '../puertos/codigo-recuperacion.repositorio.js';
import type { ProtectorCodigoRecuperacion } from '../puertos/protector-codigo-recuperacion.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosEliminarCuentaPorCodigo {
  correo: string;
  codigo: string;
}

type ResultadoIntento =
  { exito: true } | { exito: false; motivo: MotivoRecuperacionFallida };

/**
 * `POST /autenticacion/eliminacion` (RF-USU-06, PA-21): elimina la cuenta con el
 * código que se envió a su correo verificado. 204.
 *
 * Ante cualquier fallo, el mismo 422 `CODIGO_INVALIDO` (correo inexistente,
 * del Vendedor, inactivo, sin código, vencido, usado, agotado o incorrecto).
 * Un código incorrecto suma un intento (al quinto queda invalidado) y se
 * confirma aunque la respuesta sea un error. Solo sirve un código
 * `ELIMINACION_CUENTA`: uno de recuperación o de verificación nunca elimina.
 */
export class EliminarCuentaPorCodigoCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly codigos: CodigoRecuperacionRepositorio,
    private readonly protector: ProtectorCodigoRecuperacion,
    private readonly eliminador: EliminadorCuenta,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
  ) {}

  async ejecutar(datos: DatosEliminarCuentaPorCodigo): Promise<void> {
    if (!esFormatoCodigoRecuperacion(datos.codigo)) {
      throw errorDeCampo('codigo', MENSAJE_CODIGO_FORMATO);
    }
    const cuenta = await this.buscarCuenta(datos.correo);
    if (
      cuenta === null ||
      !cuenta.esCliente() ||
      !cuenta.activo ||
      cuenta.estaEliminada()
    ) {
      throw this.rechazo('SIN_CODIGO');
    }

    const resultado = await this.unidadTrabajo.ejecutar(
      async (): Promise<ResultadoIntento> => {
        const ahora = this.reloj.ahora();
        const codigo = await this.codigos.buscarUltimoParaActualizar(
          cuenta.id,
          PROPOSITOS_ELIMINACION,
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
        // Código correcto: la eliminación se une a esta transacción y borra los códigos.
        return (await this.eliminador.eliminar(cuenta, 'WEB'))
          ? { exito: true }
          : { exito: false, motivo: 'SIN_CODIGO' };
      },
    );
    if (!resultado.exito) {
      throw this.rechazo(resultado.motivo);
    }
  }

  private rechazo(
    motivo: MotivoRecuperacionFallida,
  ): CodigoRecuperacionInvalidoError {
    return new CodigoRecuperacionInvalidoError(
      motivo,
      MENSAJE_CODIGO_ELIMINACION_INVALIDO,
    );
  }

  /** Un correo con formato inválido se trata como inexistente (mismo 422). */
  private async buscarCuenta(correo: string): Promise<Usuario | null> {
    let normalizado: Correo;
    try {
      normalizado = Correo.crear(correo);
    } catch {
      return null;
    }
    return this.usuarios.buscarPorCorreo(normalizado);
  }
}
