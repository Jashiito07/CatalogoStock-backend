import {
  INTENTOS_ELIMINACION_POR_HORA,
  type LimiteEliminacionCuenta,
  type ResultadoIntentoEliminacion,
} from '../../aplicacion/puertos/limite-eliminacion-cuenta.puerto.js';

const UNA_HORA_MS = 60 * 60 * 1000;

/**
 * Límite por cuenta en memoria del proceso (ventana deslizante de una hora).
 * Es suficiente para el monolito de un solo servidor; si el servidor se
 * reinicia, el contador vuelve a cero. Guarda solo ids de cuenta y marcas de
 * tiempo, nunca claves ni datos personales.
 */
export class LimiteEliminacionCuentaMemoria implements LimiteEliminacionCuenta {
  private readonly intentos = new Map<string, number[]>();

  registrarIntento(idUsuario: string, ahora: Date): ResultadoIntentoEliminacion {
    const instante = ahora.getTime();
    const vigentes = (this.intentos.get(idUsuario) ?? []).filter(
      (marca) => marca > instante - UNA_HORA_MS,
    );
    if (vigentes.length >= INTENTOS_ELIMINACION_POR_HORA) {
      this.intentos.set(idUsuario, vigentes);
      const liberaEn = vigentes[0] + UNA_HORA_MS - instante;
      return {
        permitido: false,
        reintentarEnSegundos: Math.max(1, Math.ceil(liberaEn / 1000)),
      };
    }
    vigentes.push(instante);
    this.intentos.set(idUsuario, vigentes);
    this.limpiar(instante);
    return { permitido: true };
  }

  /** Quita las cuentas sin intentos vigentes para que el mapa no crezca sin límite. */
  private limpiar(instante: number): void {
    if (this.intentos.size < 1000) {
      return;
    }
    for (const [id, marcas] of this.intentos) {
      if (marcas.every((marca) => marca <= instante - UNA_HORA_MS)) {
        this.intentos.delete(id);
      }
    }
  }
}
