import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { ProductoNoEncontradoError } from '../../dominio/errores-producto.js';
import {
  exigirCupoDeImagenes,
  Imagen,
  type ImagenPublica,
  validarArchivoImagen,
} from '../../dominio/imagen.js';
import type { AlmacenImagenes } from '../puertos/almacen-imagenes.puerto.js';
import type { ImagenRepositorio } from '../puertos/imagen.repositorio.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';

export interface DatosAgregarImagen {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idProducto: string;
  /** Bytes del archivo subido; su tipo real se detecta por contenido. */
  contenido: Uint8Array;
}

/**
 * Agrega una imagen a un producto (RF-PRO-01, D-46). Valida en el servidor el
 * tamaño (413) y el tipo real por firma de bytes (415), y el cupo de 5 (422).
 * El producto se bloquea durante la transacción para que dos subidas
 * simultáneas no superen el cupo. El archivo se guarda con un nombre UUID
 * generado aquí (nunca el original); si algo falla después de escribirlo, el
 * archivo se borra. `IMAGEN_AGREGADA` se registra en la misma transacción.
 */
export class AgregarImagenCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly imagenes: ImagenRepositorio,
    private readonly almacen: AlmacenImagenes,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosAgregarImagen): Promise<ImagenPublica> {
    let archivoEscrito: string | null = null;
    try {
      return await this.unidadTrabajo.ejecutar(async () => {
        const producto = await this.productos.bloquearPorId(datos.idProducto);
        if (producto === null) {
          throw new ProductoNoEncontradoError();
        }
        const tipo = validarArchivoImagen(datos.contenido);
        const actuales = await this.imagenes.listarPorProducto(producto.id);
        exigirCupoDeImagenes(actuales.length);

        const imagen = Imagen.reconstituir({
          id: this.generadorId.generar(),
          productoId: producto.id,
          orden: actuales.length,
          tipo,
          tamanioBytes: datos.contenido.length,
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
        archivoEscrito = imagen.nombreArchivo;
        await this.almacen.guardar(imagen.nombreArchivo, datos.contenido);
        return imagen.aPublico();
      });
    } catch (error) {
      // Cualquier fallo (incluido el cierre de la transacción) deja la base
      // sin la fila: no debe quedar un archivo huérfano.
      if (archivoEscrito !== null) {
        await this.almacen.eliminar(archivoEscrito);
      }
      throw error;
    }
  }
}
