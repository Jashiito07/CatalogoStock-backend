import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type { PerfilVendedorRepositorio } from '../../aplicacion/puertos/perfil-vendedor.repositorio.js';
import {
  PerfilVendedor,
  type ProvinciaEcuador,
} from '../../dominio/perfil-vendedor.js';
import { PerfilVendedorOrmEntity } from './perfil-vendedor.orm-entity.js';

/** Adaptador TypeORM del puerto PerfilVendedorRepositorio (tabla `perfiles_vendedor`). */
@Injectable()
export class PerfilVendedorRepositorioTypeorm implements PerfilVendedorRepositorio {
  constructor(
    @Inject(getRepositoryToken(PerfilVendedorOrmEntity))
    private readonly repositorio: Repository<PerfilVendedorOrmEntity>,
  ) {}

  private get filas(): Repository<PerfilVendedorOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async obtener(idUsuario: string): Promise<PerfilVendedor | null> {
    const fila = await this.filas.findOneBy({ idUsuario });
    if (fila === null) {
      return null;
    }
    return PerfilVendedor.reconstituir(
      fila.idUsuario,
      {
        nombreComercial: fila.nombreComercial,
        ciudad: fila.ciudad,
        // El dominio lo validó al guardarlo; la columna solo recibe provincias de la lista.
        provincia: fila.provincia as ProvinciaEcuador,
        whatsapp: fila.whatsapp,
      },
      fila.actualizadoEn,
    );
  }

  async guardar(perfil: PerfilVendedor): Promise<void> {
    await this.filas.upsert(
      {
        idUsuario: perfil.idUsuario,
        nombreComercial: perfil.nombreComercial,
        ciudad: perfil.ciudad,
        provincia: perfil.provincia,
        whatsapp: perfil.whatsapp,
        actualizadoEn: perfil.actualizadoEn,
      },
      ['idUsuario'],
    );
  }
}
