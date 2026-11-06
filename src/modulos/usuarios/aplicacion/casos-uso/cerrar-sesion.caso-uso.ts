import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
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
  ) {}

  async ejecutar(datos: DatosCerrarSesion): Promise<void> {
    const sesion = await this.sesiones.buscarPorHashToken(
      this.generadorToken.calcularHash(datos.tokenRenovacion),
    );
    if (sesion === null || !sesion.perteneceA(datos.idUsuario)) {
      return;
    }
    await this.sesiones.revocarFamilia(
      sesion.familia,
      'CERRADA',
      this.reloj.ahora(),
    );
    // PENDIENTE (subfase 1.5): `SESION_CERRADA` con `idUsuario`, entidad
    // `SESION`, `idEntidad: sesion.id` y `detalle: {}`.
  }
}
