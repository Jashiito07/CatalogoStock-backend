import type { DataSource } from 'typeorm';
import {
  ComprobadorBaseDatosTypeorm,
  TIEMPO_COMPROBACION_MS,
} from './comprobador-base-datos.typeorm.js';

function fuenteDatosFalsa(
  isInitialized: boolean,
  query: () => Promise<unknown>,
): DataSource {
  return { isInitialized, query } as unknown as DataSource;
}

describe('ComprobadorBaseDatosTypeorm', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin conexión inicializada responde false sin consultar', async () => {
    const query = vi.fn<() => Promise<unknown>>(() => Promise.resolve([]));
    const comprobador = new ComprobadorBaseDatosTypeorm(
      fuenteDatosFalsa(false, query),
    );

    await expect(comprobador.estaDisponible()).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('con conexión y SELECT 1 correcto responde true', async () => {
    const query = vi.fn<() => Promise<unknown>>(() =>
      Promise.resolve([{ '?column?': 1 }]),
    );
    const comprobador = new ComprobadorBaseDatosTypeorm(
      fuenteDatosFalsa(true, query),
    );

    await expect(comprobador.estaDisponible()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('si la consulta falla responde false', async () => {
    const comprobador = new ComprobadorBaseDatosTypeorm(
      fuenteDatosFalsa(true, () =>
        Promise.reject(new Error('conexión perdida')),
      ),
    );

    await expect(comprobador.estaDisponible()).resolves.toBe(false);
  });

  it('si la consulta no responde a tiempo responde false', async () => {
    vi.useFakeTimers();
    const comprobador = new ComprobadorBaseDatosTypeorm(
      fuenteDatosFalsa(true, () => new Promise(() => undefined)),
    );

    const resultado = comprobador.estaDisponible();
    await vi.advanceTimersByTimeAsync(TIEMPO_COMPROBACION_MS);
    await expect(resultado).resolves.toBe(false);
  });
});
