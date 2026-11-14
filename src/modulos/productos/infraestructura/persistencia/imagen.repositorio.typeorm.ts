import { Inject, Injectable } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { repositorioEnCurso } from '../../../../compartido/infraestructura/unidad-trabajo.typeorm.js';
import type { ImagenRepositorio } from '../../aplicacion/puertos/imagen.repositorio.js';
import type { Imagen } from '../../dominio/imagen.js';
import { ImagenMapeador } from './imagen.mapeador.js';
import { ImagenOrmEntity } from './imagen.orm-entity.js';

/** Adaptador TypeORM del puerto ImagenRepositorio (tabla `imagenes_producto`). */
@Injectable()
export class ImagenRepositorioTypeorm implements ImagenRepositorio {
  constructor(
    @Inject(getRepositoryToken(ImagenOrmEntity))
    private readonly repositorio: Repository<ImagenOrmEntity>,
  ) {}

  /** Tabla en la transacción en curso (UnidadDeTrabajo), si la hay. */
  private get filas(): Repository<ImagenOrmEntity> {
    return repositorioEnCurso(this.repositorio);
  }

  async listarPorProducto(idProducto: string): Promise<Imagen[]> {
    const filas = await this.filas.find({
      where: { idProducto },
      order: { orden: 'ASC', id: 'ASC' },
    });
    return filas.map((fila) => ImagenMapeador.aDominio(fila));
  }

  async listarPorProductos(idsProducto: readonly string[]): Promise<Imagen[]> {
    if (idsProducto.length === 0) {
      return [];
    }
    const filas = await this.filas.find({
      where: { idProducto: In([...idsProducto]) },
      order: { orden: 'ASC', id: 'ASC' },
    });
    return filas.map((fila) => ImagenMapeador.aDominio(fila));
  }

  async buscar(idProducto: string, idImagen: string): Promise<Imagen | null> {
    const fila = await this.filas.findOneBy({ id: idImagen, idProducto });
    return fila ? ImagenMapeador.aDominio(fila) : null;
  }

  async insertar(imagen: Imagen): Promise<void> {
    await this.filas.insert(ImagenMapeador.aPersistencia(imagen));
  }

  async guardarOrden(imagenes: readonly Imagen[]): Promise<void> {
    for (const imagen of imagenes) {
      await this.filas.update({ id: imagen.id }, { orden: imagen.orden });
    }
  }

  async eliminar(idImagen: string): Promise<boolean> {
    const resultado = await this.filas.delete({ id: idImagen });
    return (resultado.affected ?? 0) > 0;
  }
}
