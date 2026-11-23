import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import {
  DemasiadasSolicitudesError,
  NoAutorizadoError,
} from '../../../../compartido/dominio/errores.js';
import { ClaveActualIncorrectaError } from '../../dominio/cambio-clave.js';
import { BYTES_MAXIMOS_CLAVE, bytesUtf8 } from '../../dominio/clave.js';
import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import { MENSAJE_DEMASIADAS_SOLICITUDES_CODIGO } from '../../dominio/errores-correo.js';
import type { EliminadorCuenta } from '../eliminador-cuenta.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { LimiteEliminacionCuenta } from '../puertos/limite-eliminacion-cuenta.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosEliminarCuenta {
  /** Usuario del token de acceso (propiedad: solo su propia cuenta). */
  idUsuario: string;
  /** La clave actual: confirma que quien elimina es el dueño de la sesión. */
  clave: string;
}

/**
 * `POST /usuarios/yo/eliminacion` (RF-USU-06, PA-21): el Cliente elimina su
 * propia cuenta con su clave. 204.
 *
 * - El Vendedor no se puede eliminar por aquí (403 `NO_AUTORIZADO`).
 * - Una cuenta que ya no existe, está inactiva o eliminada responde 401, como
 *   `GET /usuarios/yo`.
 * - 3 intentos por hora y por cuenta (429), cuenten como acierto o fallo.
 * - Clave incorrecta: 422 `CLAVE_ACTUAL_INCORRECTA` (como el cambio de clave).
 */
export class EliminarCuentaCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly generadorHash: GeneradorHash,
    private readonly limite: LimiteEliminacionCuenta,
    private readonly eliminador: EliminadorCuenta,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(datos: DatosEliminarCuenta): Promise<void> {
    const usuario = await this.usuarios.buscarPorId(datos.idUsuario);
    if (usuario === null || !usuario.activo || usuario.estaEliminada()) {
      throw new TokenAccesoAusenteError();
    }
    if (usuario.esVendedor()) {
      throw new NoAutorizadoError();
    }

    const intento = this.limite.registrarIntento(usuario.id, this.reloj.ahora());
    if (!intento.permitido) {
      throw new DemasiadasSolicitudesError(
        'DEMASIADAS_SOLICITUDES',
        MENSAJE_DEMASIADAS_SOLICITUDES_CODIGO,
        { reintentarEnSegundos: intento.reintentarEnSegundos },
      );
    }

    const coincide =
      bytesUtf8(datos.clave) <= BYTES_MAXIMOS_CLAVE &&
      (await this.generadorHash.comparar(datos.clave, usuario.hashClave));
    if (!coincide) {
      throw new ClaveActualIncorrectaError();
    }
    await this.eliminador.eliminar(usuario, 'APP');
  }
}
