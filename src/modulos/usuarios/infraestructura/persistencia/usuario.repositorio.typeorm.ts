import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import {
  desplazamiento,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type {
  PaginaUsuarios,
  UsuarioRepositorio,
} from '../../aplicacion/puertos/usuario.repositorio.js';
import {
  type BusquedaClientes,
  LETRAS_CON_TILDE,
  LETRAS_SIN_TILDE,
} from '../../dominio/busqueda-clientes.js';
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

/** Escapa `\`, `%` y `_` para usar el texto literal en `LIKE … ESCAPE '\'`. */
export function escaparComodinesLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** Adaptador TypeORM del puerto UsuarioRepositorio (tabla `usuarios`). */
@Injectable()
export class UsuarioRepositorioTypeorm implements UsuarioRepositorio {
  constructor(
    @Inject(getRepositoryToken(UsuarioOrmEntity))
    private readonly repositorio: Repository<UsuarioOrmEntity>,
  ) {}

  /** Tabla `usuarios` en la transacción en curso (UnidadDeTrabajo), si la hay. */
  private get filas(): Repository<UsuarioOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const fila = await this.filas.findOneBy({ id });
    return fila ? UsuarioMapeador.aDominio(fila) : null;
  }

  async buscarPorIds(ids: readonly string[]): Promise<Usuario[]> {
    if (ids.length === 0) {
      return [];
    }
    const filas = await this.filas.findBy({ id: In([...ids]) });
    return filas.map((fila) => UsuarioMapeador.aDominio(fila));
  }

  async buscarPorCorreo(correo: Correo): Promise<Usuario | null> {
    const fila = await this.filas.findOneBy({ correo: correo.valor });
    return fila ? UsuarioMapeador.aDominio(fila) : null;
  }

  async buscarVendedor(): Promise<Usuario | null> {
    const fila = await this.filas.findOneBy({ rol: 'VENDEDOR' });
    return fila ? UsuarioMapeador.aDominio(fila) : null;
  }

  existeConRol(rol: Rol): Promise<boolean> {
    return this.filas.existsBy({ rol });
  }

  async actualizarClave(
    idUsuario: string,
    hashClave: string,
    ahora: Date,
  ): Promise<void> {
    await this.filas.update(
      { id: idUsuario },
      { hashClave, fechaActualizacion: ahora },
    );
  }

  /**
   * Búsqueda sin mayúsculas ni tildes con `translate(lower(…))` y la misma
   * tabla de letras que el dominio (sin la extensión `unaccent`). Los
   * comodines de LIKE escritos por el usuario (`%`, `_`, `\`) se escapan.
   */
  async listarClientes(
    busqueda: BusquedaClientes | null,
    paginacion: Paginacion,
  ): Promise<PaginaUsuarios> {
    const consulta = this.filas
      .createQueryBuilder('u')
      .where('u.rol = :rol', { rol: 'CLIENTE' });

    if (busqueda !== null) {
      const condiciones = [
        `translate(lower(u.nombre), :conTilde, :sinTilde) LIKE :patron ESCAPE '\\'`,
        `translate(lower(u.correo), :conTilde, :sinTilde) LIKE :patron ESCAPE '\\'`,
        `u.telefono LIKE :patron ESCAPE '\\'`,
      ];
      const parametros: Record<string, string> = {
        conTilde: LETRAS_CON_TILDE,
        sinTilde: LETRAS_SIN_TILDE,
        patron: `%${escaparComodinesLike(busqueda.texto)}%`,
      };
      if (busqueda.telefonoInternacional !== null) {
        condiciones.push(`u.telefono LIKE :patronTelefono ESCAPE '\\'`);
        parametros.patronTelefono = `%${escaparComodinesLike(busqueda.telefonoInternacional)}%`;
      }
      consulta.andWhere(`(${condiciones.join(' OR ')})`, parametros);
    }

    const [filas, total] = await consulta
      // `id` desempata clientes creados en el mismo instante: orden estable entre páginas.
      .orderBy('u.fechaCreacion', 'DESC')
      .addOrderBy('u.id', 'DESC')
      .offset(desplazamiento(paginacion))
      .limit(paginacion.tamanio)
      .getManyAndCount();
    return {
      usuarios: filas.map((fila) => UsuarioMapeador.aDominio(fila)),
      total,
    };
  }

  async crear(usuario: Usuario): Promise<void> {
    try {
      await this.filas.insert(UsuarioMapeador.aPersistencia(usuario));
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
