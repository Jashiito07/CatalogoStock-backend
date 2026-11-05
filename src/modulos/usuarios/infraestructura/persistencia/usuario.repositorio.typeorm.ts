import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { UsuarioRepositorio } from '../../aplicacion/puertos/usuario.repositorio.js';
import type { Correo } from '../../dominio/correo.js';
import {
  CorreoYaRegistradoError,
  VendedorYaExisteError,
} from '../../dominio/errores-usuario.js';
import type { Rol } from '../../dominio/rol.js';
import type { Usuario } from '../../dominio/usuario.js';
import { UsuarioMapeador } from './usuario.mapeador.js';
import { UsuarioOrmEntity } from './usuario.orm-entity.js';

/** SQLSTATE de PostgreSQL para violación de unicidad. */
const VIOLACION_UNICIDAD = '23505';
const RESTRICCION_CORREO_UNICO = 'uq_usuarios_correo';
/** D-21: índice único parcial que impide un segundo Vendedor. */
const RESTRICCION_UN_VENDEDOR = 'uq_usuarios_un_vendedor';

/**
 * Nombre de la restricción única violada en un error de TypeORM/pg
 * (SQLSTATE 23505), o `undefined` si el error es de otro tipo.
 */
export function restriccionUnicaViolada(error: unknown): string | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('driverError' in error)
  ) {
    return undefined;
  }
  const original: unknown = error.driverError;
  if (
    typeof original === 'object' &&
    original !== null &&
    'code' in original &&
    original.code === VIOLACION_UNICIDAD &&
    'constraint' in original &&
    typeof original.constraint === 'string'
  ) {
    return original.constraint;
  }
  return undefined;
}

/** `true` si el error de TypeORM es la violación del índice único del correo. */
export function esCorreoDuplicado(error: unknown): boolean {
  return restriccionUnicaViolada(error) === RESTRICCION_CORREO_UNICO;
}

/** `true` si el error es la violación del índice de un solo Vendedor (D-21). */
export function esSegundoVendedor(error: unknown): boolean {
  return restriccionUnicaViolada(error) === RESTRICCION_UN_VENDEDOR;
}

/** Adaptador TypeORM del puerto UsuarioRepositorio (tabla `usuarios`). */
@Injectable()
export class UsuarioRepositorioTypeorm implements UsuarioRepositorio {
  constructor(
    @Inject(getRepositoryToken(UsuarioOrmEntity))
    private readonly repositorio: Repository<UsuarioOrmEntity>,
  ) {}

  async buscarPorId(id: string): Promise<Usuario | null> {
    const fila = await this.repositorio.findOneBy({ id });
    return fila ? UsuarioMapeador.aDominio(fila) : null;
  }

  async buscarPorCorreo(correo: Correo): Promise<Usuario | null> {
    const fila = await this.repositorio.findOneBy({ correo: correo.valor });
    return fila ? UsuarioMapeador.aDominio(fila) : null;
  }

  existeConRol(rol: Rol): Promise<boolean> {
    return this.repositorio.existsBy({ rol });
  }

  async crear(usuario: Usuario): Promise<void> {
    try {
      await this.repositorio.insert(UsuarioMapeador.aPersistencia(usuario));
    } catch (error) {
      if (esCorreoDuplicado(error)) {
        throw new CorreoYaRegistradoError();
      }
      if (esSegundoVendedor(error)) {
        throw new VendedorYaExisteError();
      }
      throw error;
    }
  }
}
