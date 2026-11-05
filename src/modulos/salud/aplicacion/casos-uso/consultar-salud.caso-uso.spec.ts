import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { ComprobadorBaseDatos } from '../puertos/comprobador-base-datos.puerto.js';
import { ConsultarSaludCasoUso } from './consultar-salud.caso-uso.js';

class ComprobadorFalso implements ComprobadorBaseDatos {
  constructor(private readonly resultado: boolean | Error) {}

  estaDisponible(): Promise<boolean> {
    return this.resultado instanceof Error
      ? Promise.reject(this.resultado)
      : Promise.resolve(this.resultado);
  }
}

const FECHA_FIJA = new Date('2026-11-04T20:00:00.000Z');
const relojFijo: Reloj = { ahora: () => FECHA_FIJA };

describe('PLAN F0: ConsultarSaludCasoUso', () => {
  it('Dado que la base de datos responde, entonces informa estado ok y baseDatos conectada', async () => {
    const casoUso = new ConsultarSaludCasoUso(
      new ComprobadorFalso(true),
      relojFijo,
    );

    await expect(casoUso.ejecutar()).resolves.toEqual({
      estado: 'ok',
      baseDatos: 'conectada',
      fecha: FECHA_FIJA,
    });
  });

  it('Dado que la base de datos no responde, entonces informa estado ok y baseDatos desconectada', async () => {
    const casoUso = new ConsultarSaludCasoUso(
      new ComprobadorFalso(false),
      relojFijo,
    );

    await expect(casoUso.ejecutar()).resolves.toEqual({
      estado: 'ok',
      baseDatos: 'desconectada',
      fecha: FECHA_FIJA,
    });
  });

  it('Dado que el comprobador falla, entonces no lanza y informa baseDatos desconectada', async () => {
    const casoUso = new ConsultarSaludCasoUso(
      new ComprobadorFalso(new Error('fallo inesperado')),
      relojFijo,
    );

    const salud = await casoUso.ejecutar();
    expect(salud.baseDatos).toBe('desconectada');
    expect(salud.estado).toBe('ok');
  });
});
