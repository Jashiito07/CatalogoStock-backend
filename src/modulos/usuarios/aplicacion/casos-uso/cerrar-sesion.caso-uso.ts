import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import type { GeneradorTokenRenovacion } from '../puertos/generador-token-renovacion.puerto.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';

export interface DatosCerrarSesion {
  /** Usuario del token de acceso ya verificado. */
  idUsuario: string;
  tokenRenovacion: string;
}

/**
 * Cierre de sesión (RF-USU-01, D-09): revoca toda la familia del token de
 * renovación indicado, para que ningún token de esa cadena vuelva a servir.
 *
 * Es idempotente: un token desconocido o ya revocado termina sin error. Si el
 * token pertenece a **otro** usuario no se revoca nada ni se revela que existe
 * (CA-02: una solicitud ajena no modifica datos).
 */
export class CerrarSesionCasoUso {
  constructor(
    private readonly sesiones: SesionRepositorio,
    private readonly generadorToken: GeneradorTokenRenovacion,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosCerrarSesion): Promise<void> {
    const sesion = await this.sesiones.buscarPorHashToken(
      this.generadorToken.calcularHash(datos.tokenRenovacion),
    );
    if (sesion === null || !sesion.perteneceA(datos.idUsuario)) {
      return;
    }
    // RF-USU-04: la revocación y su `SESION_CERRADA` se guardan juntas o
    // ninguna. Repetir la salida con una familia ya revocada no cambia nada
    // y no deja otro registro.
    await this.unidadTrabajo.ejecutar(async () => {
      const revocadas = await this.sesiones.revocarFamilia(
        sesion.familia,
        'CERRADA',
        this.reloj.ahora(),
      );
      if (revocadas > 0) {
        await this.auditoria.registrar({
          accion: 'SESION_CERRADA',
          idUsuario: datos.idUsuario,
          entidad: 'SESION',
          idEntidad: sesion.id,
          detalle: {},
        });
      }
    });
  }
}
