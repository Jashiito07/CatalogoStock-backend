import type { DataSource, EntityManager, Repository } from 'typeorm';
import {
  hayTransaccionEnCurso,
  repositorioEnCurso,
  UnidadDeTrabajoTypeorm,
} from './unidad-trabajo.typeorm.js';

class Entidad {
  id = '';
}

function preparar() {
  const repositorioTransaccion = { nombre: 'de la transacción' };
  const manejador = {
    getRepository: vi.fn<() => unknown>(() => repositorioTransaccion),
  } as unknown as EntityManager;
  const transaction = vi.fn<
    (trabajo: (m: EntityManager) => Promise<unknown>) => Promise<unknown>
  >((trabajo) => trabajo(manejador));
  const fuente = { transaction } as unknown as DataSource;
  const inyectado = {
    target: Entidad,
    nombre: 'inyectado',
  } as unknown as Repository<Entidad>;
  return {
    unidad: new UnidadDeTrabajoTypeorm(fuente),
    transaction,
    manejador,
    inyectado,
    repositorioTransaccion,
  };
}

describe('UnidadDeTrabajoTypeorm (base de CA-03)', () => {
  it('fuera de una transacción los repositorios usan el inyectado', () => {
    const { inyectado } = preparar();

    expect(hayTransaccionEnCurso()).toBe(false);
    expect(repositorioEnCurso(inyectado)).toBe(inyectado);
  });

  it('dentro de ejecutar, los repositorios de cualquier módulo usan la misma transacción', async () => {
    const { unidad, inyectado, manejador, repositorioTransaccion } = preparar();

    const usado = await unidad.ejecutar(() => {
      expect(hayTransaccionEnCurso()).toBe(true);
      return Promise.resolve(repositorioEnCurso(inyectado));
    });

    expect(usado).toBe(repositorioTransaccion);
    expect(manejador.getRepository).toHaveBeenCalledWith(Entidad);
    expect(hayTransaccionEnCurso()).toBe(false);
  });

  it('una llamada anidada se une a la transacción en curso (no abre otra)', async () => {
    const { unidad, transaction } = preparar();

    const resultado = await unidad.ejecutar(() =>
      unidad.ejecutar(() => Promise.resolve(42)),
    );

    expect(resultado).toBe(42);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('propaga el error del trabajo (TypeORM deshace la transacción)', async () => {
    const { unidad } = preparar();
    const fallo = new Error('fallo');

    await expect(unidad.ejecutar(() => Promise.reject(fallo))).rejects.toBe(
      fallo,
    );
    expect(hayTransaccionEnCurso()).toBe(false);
  });
});
