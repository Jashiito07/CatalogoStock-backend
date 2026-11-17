import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { restriccionUnicaVioladaEn } from '../../../../compartido/infraestructura/errores-base-datos.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import {
  HuellaDuplicadaError,
  type ImportacionRepositorio,
} from '../../aplicacion/puertos/importacion.repositorio.js';
import { Importacion } from '../../dominio/importacion.js';
import { ImportacionOrmEntity } from './importacion.orm-entity.js';

const RESTRICCION_HUELLA = 'uq_importaciones_producto_huella';

function aDominio(fila: ImportacionOrmEntity): Importacion {
  return Importacion.reconstituir({
    id: fila.id,
    nombreArchivo: fila.nombreArchivo,
    huella: fila.huella,
    marcaId: fila.idMarca,
    paginas: fila.paginas,
    creadaEn: fila.fechaCreacion,
  });
}

/** Adaptador TypeORM del puerto ImportacionRepositorio (tabla `importaciones_producto`). */
@Injectable()
export class ImportacionRepositorioTypeorm implements ImportacionRepositorio {
  constructor(
    @Inject(getRepositoryToken(ImportacionOrmEntity))
    private readonly repositorio: Repository<ImportacionOrmEntity>,
  ) {}

  private get filas(): Repository<ImportacionOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async insertar(importacion: Importacion): Promise<void> {
    try {
      await this.filas.insert({
        id: importacion.id,
        nombreArchivo: importacion.nombreArchivo,
        huella: importacion.huella,
        idMarca: importacion.marcaId,
        paginas: importacion.paginas,
        fechaCreacion: importacion.creadaEn,
      });
    } catch (error) {
      if (restriccionUnicaVioladaEn(error) === RESTRICCION_HUELLA) {
        throw new HuellaDuplicadaError();
      }
      throw error;
    }
  }

  async buscarPorId(id: string): Promise<Importacion | null> {
    const fila = await this.filas.findOneBy({ id });
    return fila ? aDominio(fila) : null;
  }

  async buscarPorHuella(huella: string): Promise<Importacion | null> {
    const fila = await this.filas.findOneBy({ huella });
    return fila ? aDominio(fila) : null;
  }
}
