import {
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  type Repository,
} from 'typeorm';
import { RegistroActividad } from '../../dominio/registro-actividad.js';
import { RegistroActividadMapeador } from './registro-actividad.mapeador.js';
import { RegistroActividadOrmEntity } from './registro-actividad.orm-entity.js';
import { RegistroActividadRepositorioTypeorm } from './registro-actividad.repositorio.typeorm.js';

const ID = '00000000-0000-4000-8000-0000000000a1';
const ID_USUARIO = '00000000-0000-4000-8000-0000000000b1';
const DESDE = new Date('2026-11-05T05:00:00.000Z');
const HASTA = new Date('2026-11-06T04:59:59.999Z');

function registro(): RegistroActividad {
  return RegistroActividad.crear({
    id: ID,
    fecha: DESDE,
    accion: 'SESION_INICIADA',
    idUsuario: ID_USUARIO,
    entidad: 'SESION',
    idEntidad: ID,
    detalle: { rol: 'CLIENTE', canal: 'APP' },
  }).registro;
}

function preparar() {
  const findAndCount = vi.fn<
    (opciones: unknown) => Promise<[RegistroActividadOrmEntity[], number]>
  >(() =>
    Promise.resolve([[RegistroActividadMapeador.aPersistencia(registro())], 1]),
  );
  const insert = vi.fn<(fila: RegistroActividadOrmEntity) => Promise<void>>(
    () => Promise.resolve(),
  );
  const repositorio = new RegistroActividadRepositorioTypeorm({
    findAndCount,
    insert,
  } as unknown as Repository<RegistroActividadOrmEntity>);
  return { repositorio, findAndCount, insert };
}

describe('RegistroActividadRepositorioTypeorm', () => {
  it('el mapeador hace ida y vuelta sin perder datos', () => {
    const original = registro();
    const fila = RegistroActividadMapeador.aPersistencia(original);

    expect(fila).toBeInstanceOf(RegistroActividadOrmEntity);
    expect({ ...fila }).toEqual({
      id: ID,
      fecha: DESDE,
      accion: 'SESION_INICIADA',
      idUsuario: ID_USUARIO,
      entidad: 'SESION',
      idEntidad: ID,
      detalle: { rol: 'CLIENTE', canal: 'APP' },
    });
    const vuelta = RegistroActividadMapeador.aDominio(fila);
    expect(vuelta.detalle).toEqual(original.detalle);
    expect(vuelta.fecha).toEqual(original.fecha);
  });

  it('guardar y guardarFueraDeTransaccion insertan la fila (fuera de una transacción usan el repositorio inyectado)', async () => {
    const { repositorio, insert } = preparar();

    await repositorio.guardar(registro());
    await repositorio.guardarFueraDeTransaccion(registro());

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0].id).toBe(ID);
  });

  it('consultar sin filtros ordena por fecha descendente con desempate por id y pagina', async () => {
    const { repositorio, findAndCount } = preparar();

    const resultado = await repositorio.consultar(
      {},
      { pagina: 3, tamanio: 10 },
    );

    expect(findAndCount).toHaveBeenCalledWith({
      where: {},
      order: { fecha: 'DESC', id: 'DESC' },
      skip: 20,
      take: 10,
    });
    expect(resultado.total).toBe(1);
    expect(resultado.registros[0].id).toBe(ID);
  });

  it('consultar aplica cada filtro y el rango de fechas inclusivo', async () => {
    const { repositorio, findAndCount } = preparar();
    const pagina = { pagina: 1, tamanio: 20 };

    await repositorio.consultar(
      {
        accion: 'SESION_FALLIDA',
        idUsuario: ID_USUARIO,
        entidad: 'SESION',
        idEntidad: ID,
        desde: DESDE,
        hasta: HASTA,
      },
      pagina,
    );
    await repositorio.consultar({ desde: DESDE }, pagina);
    await repositorio.consultar({ hasta: HASTA }, pagina);

    const donde = findAndCount.mock.calls.map(
      ([opciones]) => (opciones as { where: unknown }).where,
    );
    expect(donde).toEqual([
      {
        accion: 'SESION_FALLIDA',
        idUsuario: ID_USUARIO,
        entidad: 'SESION',
        idEntidad: ID,
        fecha: Between(DESDE, HASTA),
      },
      { fecha: MoreThanOrEqual(DESDE) },
      { fecha: LessThanOrEqual(HASTA) },
    ]);
  });
});
