import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { validarClaveNueva } from '../../dominio/cambio-clave.js';
import {
  CodigoRecuperacionInvalidoError,
  esFormatoCodigoRecuperacion,
  MENSAJE_CODIGO_FORMATO,
  type MotivoRecuperacionFallida,
} from '../../dominio/codigo-recuperacion.js';
import { Correo } from '../../dominio/correo.js';
import { errorDeCampo } from '../../dominio/error-campo.js';
import type { Usuario } from '../../dominio/usuario.js';
import type { CodigoRecuperacionRepositorio } from '../puertos/codigo-recuperacion.repositorio.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { ProtectorCodigoRecuperacion } from '../puertos/protector-codigo-recuperacion.puerto.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosRecuperarClave {
  correo: string;
  codigo: string;
  claveNueva: string;
}

type ResultadoIntento =
  { exito: true } | { exito: false; motivo: MotivoRecuperacionFallida };

/**
 * El Cliente cambia su clave olvidada con el código que le dio el Vendedor
 * (RF-USU-05, D-35, D-39).
 *
 * Éxito (204), en una sola transacción: hash bcrypt de la clave nueva
 * (RNF-02), código marcado como usado, **todas** las sesiones del Cliente
 * revocadas (D-09) y `CLAVE_RESTABLECIDA` (`origen: CODIGO_VENDEDOR`).
 *
 * Fallo: siempre el mismo 422 `CODIGO_INVALIDO` (correo inexistente o del
 * Vendedor, cuenta inactiva, sin código, vencido, usado, agotado o
 * incorrecto). Un código incorrecto suma un intento al código vigente (al
 * quinto queda invalidado) y ese intento se confirma aunque la respuesta sea
 * un error. `RECUPERACION_FALLIDA` (correo intentado y motivo, D-20) se
 * registra fuera de la transacción y sin interrumpir la respuesta.
 */
export class RecuperarClaveCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly sesiones: SesionRepositorio,
    private readonly codigos: CodigoRecuperacionRepositorio,
    private readonly protector: ProtectorCodigoRecuperacion,
    private readonly generadorHash: GeneradorHash,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosRecuperarClave): Promise<void> {
    // Defensa en profundidad: el DTO ya validó el formato (400).
    const claveNueva = validarClaveNueva(datos.claveNueva);
    if (!esFormatoCodigoRecuperacion(datos.codigo)) {
      throw errorDeCampo('codigo', MENSAJE_CODIGO_FORMATO);
    }
    const cuenta = await this.buscarCuenta(datos.correo);
    // Solo un Cliente activo recupera su clave con un código; el Vendedor usa
    // el comando del servidor (D-35).
    if (cuenta === null || !cuenta.esCliente() || !cuenta.activo) {
      throw await this.rechazar(datos, cuenta, 'NO_CLIENTE');
    }
    const usuario = cuenta;

    const resultado = await this.unidadTrabajo.ejecutar(
      async (): Promise<ResultadoIntento> => {
        const ahora = this.reloj.ahora();
        const codigo = await this.codigos.buscarUltimoParaActualizar(
          usuario.id,
        );
        if (codigo === null) {
          return { exito: false, motivo: 'SIN_CODIGO' };
        }
        const motivo = codigo.motivoSiNoVigente(ahora);
        if (motivo !== null) {
          return { exito: false, motivo };
        }
        if (!this.protector.coincide(datos.codigo, codigo.hashCodigo)) {
          // Se confirma con la transacción: se devuelve un resultado en
          // lugar de lanzar el error, que la desharía.
          codigo.registrarIntentoFallido(ahora);
          await this.codigos.guardar(codigo);
          return { exito: false, motivo: 'CODIGO_INCORRECTO' };
        }

        const hashClave = await this.generadorHash.generar(claveNueva);
        codigo.marcarUsado(ahora);
        await this.codigos.guardar(codigo);
        await this.usuarios.actualizarClave(usuario.id, hashClave, ahora);
        const sesionesRevocadas = await this.sesiones.revocarDeUsuario(
          usuario.id,
          ahora,
        );
        await this.auditoria.registrar({
          accion: 'CLAVE_RESTABLECIDA',
          idUsuario: usuario.id,
          entidad: 'USUARIO',
          idEntidad: usuario.id,
          detalle: { origen: 'CODIGO_VENDEDOR', sesionesRevocadas },
        });
        return { exito: true };
      },
    );

    if (!resultado.exito) {
      throw await this.rechazar(datos, usuario, resultado.motivo);
    }
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

  /**
   * D-20: `RECUPERACION_FALLIDA` con el correo intentado y el motivo (nunca el
   * código ni la clave), con el id de la cuenta si existe. Sin interrumpir:
   * si la bitácora falla, la respuesta sigue siendo el mismo 422.
   */
  private async rechazar(
    datos: DatosRecuperarClave,
    cuenta: Usuario | null,
    motivo: MotivoRecuperacionFallida,
  ): Promise<CodigoRecuperacionInvalidoError> {
    const idCuenta = cuenta?.id ?? null;
    await this.auditoria.registrarSinInterrumpir({
      accion: 'RECUPERACION_FALLIDA',
      idUsuario: idCuenta,
      entidad: 'USUARIO',
      idEntidad: idCuenta,
      detalle: { correo: datos.correo, motivo },
    });
    return new CodigoRecuperacionInvalidoError(motivo);
  }
}
