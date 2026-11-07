import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import { RegistroActividad } from '../../dominio/registro-actividad.js';
import {
  ConsultarBitacoraCasoUso,
  NOMBRE_USUARIO_ELIMINADO,
} from './consultar-bitacora.caso-uso.js';
import {
  DirectorioUsuariosFalso,
  RegistroActividadRepositorioEnMemoria,
} from './dobles.prueba-spec.js';

const MARIA = '00000000-0000-4000-8000-0000000000c1';
const BORRADO = '00000000-0000-4000-8000-0000000000c2';

function registro(
  numero: number,
  idUsuario: string | null,
  minutos: number,
): RegistroActividad {
  return RegistroActividad.crear({
    id: `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`,
    fecha: new Date(Date.UTC(2026, 10, 5, 15, minutos)),
    accion: 'ACCESO_DENEGADO',
    idUsuario,
    entidad: null,
    idEntidad: null,
    detalle: {
      metodo: 'GET',
      ruta: '/api/v1/auditoria',
      rolUsuario: 'CLIENTE',
    },
  }).registro;
}

function preparar() {
  const repositorio = new RegistroActividadRepositorioEnMemoria();
  const directorio = new DirectorioUsuariosFalso([
    { id: MARIA, nombre: 'María Zambrano', rol: 'CLIENTE' },
  ]);
  const casoUso = new ConsultarBitacoraCasoUso(repositorio, directorio);
  return { repositorio, directorio, casoUso };
}

describe('RF-USU-04: ConsultarBitacoraCasoUso', () => {
  it('devuelve la página con el formato del contrato y el nombre y rol de cada usuario al consultar', async () => {
    const { repositorio, directorio, casoUso } = preparar();
    repositorio.registros.push(
      registro(1, MARIA, 1),
      registro(2, MARIA, 3),
      registro(3, null, 2),
    );

    const pagina = await casoUso.ejecutar({}, { pagina: 1, tamanio: 20 });

    expect(pagina.total).toBe(3);
    expect(pagina.pagina).toBe(1);
    expect(pagina.tamanio).toBe(20);
    expect(pagina.elementos.map((e) => e.id.slice(-1))).toEqual([
      '2',
      '3',
      '1',
    ]);
    expect(pagina.elementos[0]).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      fecha: new Date(Date.UTC(2026, 10, 5, 15, 3)),
      accion: 'ACCESO_DENEGADO',
      usuario: { id: MARIA, nombre: 'María Zambrano', rol: 'CLIENTE' },
      entidad: null,
      idEntidad: null,
      detalle: {
        metodo: 'GET',
        ruta: '/api/v1/auditoria',
        rolUsuario: 'CLIENTE',
      },
    });
    expect(pagina.elementos[1].usuario).toBeNull();
    // Una sola búsqueda por página y sin ids repetidos.
    expect(directorio.consultas).toEqual([[MARIA]]);
  });

  it('un usuario que ya no existe se muestra como «Usuario eliminado»', async () => {
    const { repositorio, casoUso } = preparar();
    repositorio.registros.push(registro(1, BORRADO, 1));

    const pagina = await casoUso.ejecutar({}, { pagina: 1, tamanio: 20 });

    expect(pagina.elementos[0].usuario).toEqual({
      id: BORRADO,
      nombre: NOMBRE_USUARIO_ELIMINADO,
      rol: null,
    });
  });

  it('sin usuarios en la página no consulta el directorio', async () => {
    const { repositorio, directorio, casoUso } = preparar();
    repositorio.registros.push(registro(1, null, 1));

    await casoUso.ejecutar({}, { pagina: 1, tamanio: 20 });

    expect(directorio.consultas).toEqual([]);
  });

  it('pasa filtros y paginación al repositorio', async () => {
    const { repositorio, casoUso } = preparar();
    const filtros = { accion: 'SESION_FALLIDA' as const, idUsuario: MARIA };

    await casoUso.ejecutar(filtros, { pagina: 2, tamanio: 5 });

    expect(repositorio.ultimaConsulta).toEqual({
      filtros,
      paginacion: { pagina: 2, tamanio: 5 },
    });
  });

  it('hasta < desde → DATOS_INVALIDOS sin consultar', async () => {
    const { repositorio, casoUso } = preparar();

    await expect(
      casoUso.ejecutar(
        {
          desde: new Date('2026-11-06T00:00:00Z'),
          hasta: new Date('2026-11-05T00:00:00Z'),
        },
        { pagina: 1, tamanio: 20 },
      ),
    ).rejects.toBeInstanceOf(DatosInvalidosError);
    expect(repositorio.ultimaConsulta).toBeUndefined();
  });
});
