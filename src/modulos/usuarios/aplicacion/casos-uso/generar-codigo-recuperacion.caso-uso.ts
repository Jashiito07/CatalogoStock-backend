import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  ClienteNoEncontradoError,
  CuentaInactivaError,
} from '../../dominio/cambio-clave.js';
import { CodigoRecuperacion } from '../../dominio/codigo-recuperacion.js';
import type { CodigoRecuperacionRepositorio } from '../puertos/codigo-recuperacion.repositorio.js';
import type { ProtectorCodigoRecuperacion } from '../puertos/protector-codigo-recuperacion.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosGenerarCodigo {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idCliente: string;
}

export interface CodigoGenerado {
  /** La **única** vez que el código sale del servidor. */
  codigo: string;
  venceEn: Date;
  cliente: { id: string; nombre: string; correo: string };
}

/**
 * El Vendedor genera un código de recuperación para un Cliente (RF-USU-05,
 * D-35, D-39).
 *
 * - Solo para usuarios con rol `CLIENTE`: un id inexistente o del Vendedor
 *   responde 404 `NO_ENCONTRADO`; un Cliente inactivo, 422 `CUENTA_INACTIVA`.
 * - Código de 6 dígitos criptográfico, vigente 15 minutos; se guarda solo su
 *   hash. Generar uno nuevo invalida el anterior.
 * - `CODIGO_RECUPERACION_GENERADO` se registra en la misma transacción, con
 *   el vencimiento y **nunca** el código.
 */
export class GenerarCodigoRecuperacionCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly codigos: CodigoRecuperacionRepositorio,
    private readonly protector: ProtectorCodigoRecuperacion,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosGenerarCodigo): Promise<CodigoGenerado> {
    const cliente = await this.usuarios.buscarPorId(datos.idCliente);
    if (cliente === null || !cliente.esCliente()) {
      throw new ClienteNoEncontradoError();
    }
    if (!cliente.activo) {
      throw new CuentaInactivaError();
    }

    const ahora = this.reloj.ahora();
    const codigo = this.protector.generar();
    const registro = CodigoRecuperacion.generar({
      id: this.generadorId.generar(),
      idUsuario: cliente.id,
      hashCodigo: this.protector.calcularHash(codigo),
      generadoPor: datos.idVendedor,
      ahora,
    });

    await this.unidadTrabajo.ejecutar(async () => {
      await this.codigos.reemplazarPendientes(registro, ahora);
      await this.auditoria.registrar({
        accion: 'CODIGO_RECUPERACION_GENERADO',
        idUsuario: datos.idVendedor,
        entidad: 'USUARIO',
        idEntidad: cliente.id,
        detalle: { venceEn: registro.venceEn.toISOString() },
      });
    });

    return {
      codigo,
      venceEn: registro.venceEn,
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre.valor,
        correo: cliente.correo.valor,
      },
    };
  }
}
