import { NoEncontradoError } from '../../../../compartido/dominio/errores.js';
import { tipoDeNombreDeArchivo } from '../../dominio/imagen.js';
import type {
  AlmacenImagenes,
  ArchivoImagen,
} from '../puertos/almacen-imagenes.puerto.js';

/**
 * Lee una imagen para servirla públicamente (`GET /api/v1/imagenes/{archivo}`,
 * D-46). El nombre debe ser `<uuid>.(jpg|png|webp)`: cualquier otro (rutas
 * relativas, separadores, extensiones ajenas) o un archivo inexistente es 404.
 */
export class ObtenerArchivoImagenCasoUso {
  constructor(private readonly almacen: AlmacenImagenes) {}

  async ejecutar(nombreArchivo: string): Promise<ArchivoImagen> {
    const tipo = tipoDeNombreDeArchivo(nombreArchivo);
    if (tipo === null) {
      throw new NoEncontradoError('La imagen no existe.');
    }
    const contenido = await this.almacen.leer(nombreArchivo);
    if (contenido === null) {
      throw new NoEncontradoError('La imagen no existe.');
    }
    return { contenido, tipo };
  }
}
