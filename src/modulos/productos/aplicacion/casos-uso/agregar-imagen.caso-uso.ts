import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { ProductoNoEncontradoError } from '../../dominio/errores-producto.js';
import {
  exigirCupoDeImagenes,
  exigirDimensionesAdmitidas,
  Imagen,
  type ImagenPublica,
  TIPO_IMAGEN_GUARDADA,
  validarArchivoImagen,
} from '../../dominio/imagen.js';
import type { AlmacenImagenes } from '../puertos/almacen-imagenes.puerto.js';
import type { ImagenRepositorio } from '../puertos/imagen.repositorio.js';
import type { ProcesadorImagenes } from '../puertos/procesador-imagenes.puerto.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';

export interface DatosAgregarImagen {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idProducto: string;
  /** Bytes del archivo subido; su tipo real se detecta por contenido. */
  contenido: Uint8Array;
}

/**
 * Agrega una imagen a un producto (RF-PRO-01, D-46, DEC-06).
 *
 * 1. Valida en el servidor el tamaño (413), el tipo real por firma de bytes
 *    (415), las dimensiones de la cabecera antes de decodificar (422) y el cupo
 *    de 5 (422).
 * 2. Vuelve a codificar la imagen en JPEG: detalle de 800 px y miniatura de
 *    320 px como máximo, sin metadatos EXIF (ni GPS) y con la orientación
 *    corregida. Nunca se guarda el archivo original.
 * 3. Guarda los dos archivos con un nombre UUID generado aquí (nunca el
 *    original) y registra `IMAGEN_AGREGADA` en la misma transacción.
 *
 * El producto se bloquea durante la transacción para que dos subidas
 * simultáneas no superen el cupo. Si algo falla después de escribir algún
 * archivo, se borran todos los escritos.
 */
export class AgregarImagenCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly imagenes: ImagenRepositorio,
    private readonly almacen: AlmacenImagenes,
    private readonly procesador: ProcesadorImagenes,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosAgregarImagen): Promise<ImagenPublica> {
    const archivosEscritos: string[] = [];
    try {
      return await this.unidadTrabajo.ejecutar(async () => {
        const producto = await this.productos.bloquearPorId(datos.idProducto);
        // D-60: el producto de otro Vendedor responde 404.
        if (producto === null || !producto.perteneceA(datos.idVendedor)) {
          throw new ProductoNoEncontradoError();
        }
        const tipo = validarArchivoImagen(datos.contenido);
        exigirDimensionesAdmitidas(datos.contenido, tipo);
        const actuales = await this.imagenes.listarPorProducto(producto.id);
        exigirCupoDeImagenes(actuales.length);

        const { detalle, miniatura } = await this.procesador.procesar(
          datos.contenido,
        );
        const imagen = Imagen.reconstituir({
          id: this.generadorId.generar(),
          productoId: producto.id,
          orden: actuales.length,
          tipo: TIPO_IMAGEN_GUARDADA,
          tamanioBytes: detalle.contenido.length,
          ancho: detalle.ancho,
          alto: detalle.alto,
          conMiniatura: true,
          creadaEn: this.reloj.ahora(),
        });
        await this.imagenes.insertar(imagen);
        await this.auditoria.registrar({
          accion: 'IMAGEN_AGREGADA',
          idUsuario: datos.idVendedor,
          entidad: 'PRODUCTO',
          idEntidad: producto.id,
          detalle: { idImagen: imagen.id },
        });
        archivosEscritos.push(imagen.nombreArchivo);
        await this.almacen.guardar(imagen.nombreArchivo, detalle.contenido);
        const nombreMiniatura = imagen.nombreMiniatura as string;
        archivosEscritos.push(nombreMiniatura);
        await this.almacen.guardar(nombreMiniatura, miniatura.contenido);
        return imagen.aPublico();
      });
    } catch (error) {
      // Cualquier fallo (incluido el cierre de la transacción) deja la base
      // sin la fila: no debe quedar ningún archivo huérfano.
      for (const nombre of archivosEscritos) {
        await this.almacen.eliminar(nombre);
      }
      throw error;
    }
  }
}
