import {
  Controller,
  Get,
  Inject,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import { ObtenerArchivoImagenCasoUso } from '../../aplicacion/casos-uso/obtener-archivo-imagen.caso-uso.js';
import { CONTENT_TYPE_POR_TIPO } from '../../dominio/imagen.js';

/**
 * `GET /api/v1/imagenes/{archivo}` — público (D-46): el nombre es un UUID
 * imposible de adivinar y son fotos de catálogo, no datos personales. Solo
 * sirve archivos `<uuid>.(jpg|png|webp)` de la carpeta de imágenes: no lista
 * directorios y cualquier otro nombre responde 404.
 */
@Controller('imagenes')
@Publico()
export class ImagenesController {
  constructor(
    @Inject(ObtenerArchivoImagenCasoUso)
    private readonly obtenerArchivo: ObtenerArchivoImagenCasoUso,
  ) {}

  @Get(':archivo')
  async obtener(
    @Param('archivo') archivo: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<StreamableFile> {
    const { contenido, tipo } = await this.obtenerArchivo.ejecutar(archivo);
    const contentType = CONTENT_TYPE_POR_TIPO[tipo];
    respuesta.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // helmet pone `same-origin`: el panel y la app (otro origen) deben poder
      // mostrar estas fotos públicas de catálogo.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return new StreamableFile(contenido, {
      type: contentType,
      length: contenido.length,
    });
  }
}
