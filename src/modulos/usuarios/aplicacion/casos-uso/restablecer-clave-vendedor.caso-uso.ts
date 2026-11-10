import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  validarClaveNueva,
  VendedorNoExisteError,
} from '../../dominio/cambio-clave.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface ResultadoRestablecerClaveVendedor {
  idUsuario: string;
  sesionesRevocadas: number;
}

/**
 * Restablece la clave del único Vendedor desde el servidor (RF-USU-05, D-35):
 * no hay endpoint HTTP. Lo usa `npm run restablecer-clave-vendedor`.
 *
 * - La clave nueva cumple las reglas de la clave (D-22); se guarda solo su
 *   hash (RNF-02).
 * - En una sola transacción: hash nuevo, revocación de **todas** las sesiones
 *   del Vendedor y `CLAVE_RESTABLECIDA` con `origen: COMANDO_SERVIDOR`.
 * - Sin Vendedor, falla con `VendedorNoExisteError` (sugiere `crear-vendedor`).
 */
export class RestablecerClaveVendedorCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly sesiones: SesionRepositorio,
    private readonly generadorHash: GeneradorHash,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(
    claveNueva: string,
  ): Promise<ResultadoRestablecerClaveVendedor> {
    const clave = validarClaveNueva(claveNueva);
    const vendedor = await this.usuarios.buscarVendedor();
    if (vendedor === null) {
      throw new VendedorNoExisteError();
    }

    const hashClave = await this.generadorHash.generar(clave);
    const ahora = this.reloj.ahora();
    const sesionesRevocadas = await this.unidadTrabajo.ejecutar(async () => {
      await this.usuarios.actualizarClave(vendedor.id, hashClave, ahora);
      const revocadas = await this.sesiones.revocarDeUsuario(
        vendedor.id,
        ahora,
      );
      await this.auditoria.registrar({
        accion: 'CLAVE_RESTABLECIDA',
        idUsuario: vendedor.id,
        entidad: 'USUARIO',
        idEntidad: vendedor.id,
        detalle: { origen: 'COMANDO_SERVIDOR', sesionesRevocadas: revocadas },
      });
      return revocadas;
    });

    return { idUsuario: vendedor.id, sesionesRevocadas };
  }
}
