import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import {
  desplazamiento,
  type Pagina,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import { restriccionUnicaVioladaEn } from '../../../../compartido/infraestructura/errores-base-datos.js';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import {
  type FiltroImportaciones,
  HuellaDuplicadaError,
  type ImportacionRepositorio,
} from '../../aplicacion/puertos/importacion.repositorio.js';
import { Importacion } from '../../dominio/importacion.js';
import { ImportacionOrmEntity } from './importacion.orm-entity.js';

const RESTRICCION_HUELLA = 'uq_importaciones_producto_huella';

function aDominio(fila: ImportacionOrmEntity): Importacion {
  return Importacion.reconstituir({
    id: fila.id,
    idVendedor: fila.idVendedor,
    nombreArchivo: fila.nombreArchivo,
    huella: fila.huella,
    marcaId: fila.idMarca,
    paginas: fila.paginas,
    estado: fila.estado,
    archivadaEn: fila.archivadaEn,
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
        idVendedor: importacion.idVendedor,
        nombreArchivo: importacion.nombreArchivo,
        huella: importacion.huella,
        idMarca: importacion.marcaId,
        paginas: importacion.paginas,
        estado: importacion.estado,
        archivadaEn: importacion.archivadaEn,
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

  async bloquearPorId(id: string): Promise<Importacion | null> {
    const fila = await this.filas.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return fila ? aDominio(fila) : null;
  }

  async buscarPorHuella(
    idVendedor: string,
    huella: string,
  ): Promise<Importacion | null> {
    const fila = await this.filas.findOneBy({ idVendedor, huella });
    return fila ? aDominio(fila) : null;
  }

  async archivarVigentesDeMarca(
    idVendedor: string,
    marcaId: string,
    ahora: Date,
  ): Promise<number> {
    // Una subida por Vendedor y marca a la vez: sin esto, dos subidas
    // simultáneas dejarían dos vigentes y la segunda fallaría contra el índice único.
    await this.filas.manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`importaciones_producto:${idVendedor}:${marcaId}`],
    );
    const resultado = await this.filas.update(
      { idVendedor, idMarca: marcaId, estado: 'VIGENTE' },
      { estado: 'ARCHIVADA', archivadaEn: ahora },
    );
    return resultado.affected ?? 0;
  }

  async listar(
    filtro: FiltroImportaciones,
    paginacion: Paginacion,
  ): Promise<Pagina<Importacion>> {
    const donde: FindOptionsWhere<ImportacionOrmEntity> = {
      idVendedor: filtro.idVendedor,
    };
    if (filtro.estado !== undefined) {
      donde.estado = filtro.estado;
    }
    if (filtro.marcaId !== undefined) {
      donde.idMarca = filtro.marcaId;
    }
    const [filas, total] = await this.filas.findAndCount({
      where: donde,
      order: { fechaCreacion: 'DESC', id: 'DESC' },
      skip: desplazamiento(paginacion),
      take: paginacion.tamanio,
    });
    return {
      elementos: filas.map(aDominio),
      pagina: paginacion.pagina,
      tamanio: paginacion.tamanio,
      total,
    };
  }

  async listarArchivadas(): Promise<Importacion[]> {
    const filas = await this.filas.find({
      where: { estado: 'ARCHIVADA' },
      order: { archivadaEn: 'ASC', id: 'ASC' },
    });
    return filas.map(aDominio);
  }

  async eliminar(id: string): Promise<boolean> {
    const resultado = await this.filas.delete({ id });
    return (resultado.affected ?? 0) > 0;
  }
}
