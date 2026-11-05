import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ComprobadorBaseDatos } from '../aplicacion/puertos/comprobador-base-datos.puerto.js';

/** Tiempo máximo de espera de la consulta de comprobación. */
export const TIEMPO_COMPROBACION_MS = 2000;

/** Adaptador TypeORM: ejecuta `SELECT 1` si la conexión está abierta. */
@Injectable()
export class ComprobadorBaseDatosTypeorm implements ComprobadorBaseDatos {
  constructor(@Inject(DataSource) private readonly fuenteDatos: DataSource) {}

  async estaDisponible(): Promise<boolean> {
    if (!this.fuenteDatos.isInitialized) {
      return false;
    }
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<boolean>((resolver) => {
      temporizador = setTimeout(() => resolver(false), TIEMPO_COMPROBACION_MS);
    });
    const consulta = this.fuenteDatos
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
    try {
      return await Promise.race([consulta, limite]);
    } finally {
      clearTimeout(temporizador);
    }
  }
}
