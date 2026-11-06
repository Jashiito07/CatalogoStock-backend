import type { Repository } from 'typeorm';
import { Correo } from '../../dominio/correo.js';
import {
  CorreoYaRegistradoError,
  VendedorYaExisteError,
} from '../../dominio/errores-usuario.js';
import { NombreUsuario } from '../../dominio/nombre-usuario.js';
import { Telefono } from '../../dominio/telefono.js';
import { Usuario } from '../../dominio/usuario.js';
import { UsuarioMapeador } from './usuario.mapeador.js';
import { UsuarioOrmEntity } from './usuario.orm-entity.js';
import {
  esCorreoDuplicado,
  esSegundoVendedor,
  restriccionUnicaViolada,
  UsuarioRepositorioTypeorm,
} from './usuario.repositorio.typeorm.js';

const AHORA = new Date('2026-11-05T15:00:00.000Z');

function vendedor(): Usuario {
  return Usuario.crearVendedor({
    id: '00000000-0000-4000-8000-000000000001',
    nombre: NombreUsuario.crear('Vendedor de Prueba'),
    correo: Correo.crear('Vendedor@Ejemplo.test'),
    telefono: Telefono.crear('0991234567'),
    hashClave: '$2b$12$hashficticio',
    ahora: AHORA,
  });
}

function fila(): UsuarioOrmEntity {
  return UsuarioMapeador.aPersistencia(vendedor());
}

function repositorioFalso(metodos: Partial<Repository<UsuarioOrmEntity>>) {
  return new UsuarioRepositorioTypeorm(
    metodos as unknown as Repository<UsuarioOrmEntity>,
  );
}

describe('UsuarioMapeador', () => {
  it('pasa del dominio a la fila con las columnas en español y el correo en minúsculas', () => {
    expect({ ...fila() }).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      nombre: 'Vendedor de Prueba',
      correo: 'vendedor@ejemplo.test',
      telefono: '+593991234567',
      hashClave: '$2b$12$hashficticio',
      rol: 'VENDEDOR',
      activo: true,
      fechaAceptacionPrivacidad: null,
      versionPrivacidad: null,
      fechaCreacion: AHORA,
      fechaActualizacion: AHORA,
    });
  });

  it('ida y vuelta conserva todos los datos', () => {
    const original = vendedor();
    const reconstruido = UsuarioMapeador.aDominio(
      UsuarioMapeador.aPersistencia(original),
    );
    expect(reconstruido.aPublico()).toEqual(original.aPublico());
    expect(reconstruido.hashClave).toBe(original.hashClave);
    expect(reconstruido.activo).toBe(original.activo);
    expect(reconstruido.actualizadoEn).toEqual(original.actualizadoEn);
  });

  it('una fila con un rol desconocido no se acepta', () => {
    const corrupta = { ...fila(), rol: 'ADMIN' } as unknown as UsuarioOrmEntity;
    expect(() => UsuarioMapeador.aDominio(corrupta)).toThrow('El rol debe ser');
  });
});

describe('UsuarioRepositorioTypeorm', () => {
  it('buscarPorCorreo consulta con el correo normalizado', async () => {
    const findOneBy = vi.fn<() => Promise<UsuarioOrmEntity | null>>(() =>
      Promise.resolve(fila()),
    );
    const repositorio = repositorioFalso({ findOneBy });

    const usuario = await repositorio.buscarPorCorreo(
      Correo.crear('VENDEDOR@ejemplo.test'),
    );

    expect(findOneBy).toHaveBeenCalledWith({ correo: 'vendedor@ejemplo.test' });
    expect(usuario?.rol).toBe('VENDEDOR');
  });

  it('buscarPorId devuelve null si no existe', async () => {
    const repositorio = repositorioFalso({
      findOneBy: () => Promise.resolve(null),
    });
    await expect(repositorio.buscarPorId('x')).resolves.toBeNull();
  });

  it('buscarPorCorreo devuelve null si no existe', async () => {
    const repositorio = repositorioFalso({
      findOneBy: () => Promise.resolve(null),
    });
    await expect(
      repositorio.buscarPorCorreo(Correo.crear('nadie@ejemplo.test')),
    ).resolves.toBeNull();
  });

  it('buscarPorId reconstruye el usuario', async () => {
    const repositorio = repositorioFalso({
      findOneBy: () => Promise.resolve(fila()),
    });
    const usuario = await repositorio.buscarPorId(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(usuario?.correo.valor).toBe('vendedor@ejemplo.test');
  });

  it('existeConRol consulta por rol', async () => {
    const existsBy = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const repositorio = repositorioFalso({ existsBy });

    await expect(repositorio.existeConRol('VENDEDOR')).resolves.toBe(true);
    expect(existsBy).toHaveBeenCalledWith({ rol: 'VENDEDOR' });
  });

  it('crear inserta la fila mapeada, con el hash y sin la clave', async () => {
    const insert = vi.fn<(fila: UsuarioOrmEntity) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const repositorio = repositorioFalso({
      insert: insert as unknown as Repository<UsuarioOrmEntity>['insert'],
    });

    await repositorio.crear(vendedor());

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toBeInstanceOf(UsuarioOrmEntity);
    expect(insert.mock.calls[0][0].hashClave).toBe('$2b$12$hashficticio');
  });

  it('crear traduce la violación del índice único del correo a CORREO_YA_REGISTRADO', async () => {
    const repositorio = repositorioFalso({
      insert: () =>
        Promise.reject({
          driverError: { code: '23505', constraint: 'uq_usuarios_correo' },
        }),
    });

    await expect(repositorio.crear(vendedor())).rejects.toBeInstanceOf(
      CorreoYaRegistradoError,
    );
  });

  it('D-21: crear traduce la violación del índice de un solo Vendedor a VendedorYaExisteError (no a CORREO_YA_REGISTRADO)', async () => {
    const repositorio = repositorioFalso({
      insert: () =>
        Promise.reject({
          driverError: { code: '23505', constraint: 'uq_usuarios_un_vendedor' },
        }),
    });

    const creacion = repositorio.crear(vendedor());

    await expect(creacion).rejects.toBeInstanceOf(VendedorYaExisteError);
    await expect(creacion).rejects.not.toBeInstanceOf(CorreoYaRegistradoError);
  });

  it('crear deja pasar cualquier otro error', async () => {
    const otro = new Error('fallo de conexión');
    const repositorio = repositorioFalso({
      insert: () => Promise.reject(otro),
    });

    await expect(repositorio.crear(vendedor())).rejects.toBe(otro);
  });
});

describe('esCorreoDuplicado', () => {
  it.each([
    [
      { driverError: { code: '23505', constraint: 'uq_usuarios_correo' } },
      true,
    ],
    [{ driverError: { code: '23505', constraint: 'pk_usuarios' } }, false],
    [
      { driverError: { code: '23514', constraint: 'uq_usuarios_correo' } },
      false,
    ],
    [{ driverError: null }, false],
    [{ driverError: 'texto' }, false],
    [new Error('otro'), false],
    [null, false],
    ['texto', false],
  ])('%j → %s', (error, esperado) => {
    expect(esCorreoDuplicado(error)).toBe(esperado);
  });
});

describe('D-21: esSegundoVendedor', () => {
  it.each([
    [
      { driverError: { code: '23505', constraint: 'uq_usuarios_un_vendedor' } },
      true,
    ],
    [
      { driverError: { code: '23505', constraint: 'uq_usuarios_correo' } },
      false,
    ],
    [
      { driverError: { code: '23514', constraint: 'uq_usuarios_un_vendedor' } },
      false,
    ],
    [{ driverError: { code: '23505' } }, false],
    [null, false],
  ])('%j → %s', (error, esperado) => {
    expect(esSegundoVendedor(error)).toBe(esperado);
  });

  it('restriccionUnicaViolada devuelve el nombre solo con SQLSTATE 23505', () => {
    expect(
      restriccionUnicaViolada({
        driverError: { code: '23505', constraint: 'uq_x' },
      }),
    ).toBe('uq_x');
    expect(
      restriccionUnicaViolada({
        driverError: { code: '23505', constraint: 1 },
      }),
    ).toBeUndefined();
  });
});
