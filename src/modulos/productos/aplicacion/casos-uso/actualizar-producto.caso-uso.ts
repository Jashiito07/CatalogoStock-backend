import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  MarcaInactivaError,
  MarcaNoEncontradaError,
  ProductoNoEncontradoError,
} from '../../dominio/errores-producto.js';
import type { CambiosProducto } from '../../dominio/producto.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';
import type { VistaProducto } from '../vista-producto.js';

export interface DatosActualizarProducto {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idProducto: string;
  /** `undefined` = sin cambio. */
  cambios: CambiosProducto;
}

/**
 * Cambia parcialmente un producto (RF-PRO-02, RF-PRO-05, CA-05, CA-07). Si
 * cambia de marca, la nueva debe existir (404) y estar activa (422). Si cambia
 * el precio, la bitácora guarda `precioAnterior` y `precioNuevo`. Si nada
 * cambia, no escribe ni registra. Los pedidos ya creados conservan su propio
 * nombre y precio (PA-07).
 */
export class ActualizarProductoCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly marcas: DirectorioMarcas,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosActualizarProducto): Promise<VistaProducto> {
    return this.unidadTrabajo.ejecutar(async () => {
      const actual = await this.productos.buscarPorId(datos.idProducto);
      if (actual === null) {
        throw new ProductoNoEncontradoError();
      }
      const { producto, campos, precioAnterior } = actual.aplicar(
        datos.cambios,
        this.reloj.ahora(),
      );

      const marca = await this.marcas.buscarPorId(producto.marcaId);
      if (marca === null) {
        throw new MarcaNoEncontradaError();
      }
      if (campos.length === 0) {
        return { producto: producto.aPublico(), marca };
      }
      // Solo se exige marca activa si el producto cambia de marca: editar el
      // precio de un producto de una marca inactiva sigue permitido.
      if (campos.includes('marcaId') && !marca.activa) {
        throw new MarcaInactivaError();
      }

      if (!(await this.productos.guardar(producto))) {
        throw new ProductoNoEncontradoError();
      }
      await this.auditoria.registrar({
        accion: 'PRODUCTO_ACTUALIZADO',
        idUsuario: datos.idVendedor,
        entidad: 'PRODUCTO',
        idEntidad: producto.id,
        detalle:
          precioAnterior === null
            ? { campos }
            : {
                campos,
                precioAnterior: precioAnterior.aTexto(),
                precioNuevo: producto.precio.aTexto(),
              },
      });
      return { producto: producto.aPublico(), marca };
    });
  }
}
