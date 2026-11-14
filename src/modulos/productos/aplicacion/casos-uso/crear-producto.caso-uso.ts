import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  MarcaInactivaError,
  MarcaNoEncontradaError,
} from '../../dominio/errores-producto.js';
import { Producto } from '../../dominio/producto.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';
import type { ProductoRepositorio } from '../puertos/producto.repositorio.js';
import type { VistaProducto } from '../vista-producto.js';

export interface DatosCrearProducto {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  nombre: unknown;
  marcaId: unknown;
  precio: unknown;
  descripcion?: unknown;
  disponibilidad?: unknown;
}

/**
 * Crea un producto (RF-PRO-01, RF-PRO-04, RF-PRO-05, CA-04). Valida los datos
 * (400), comprueba que la marca exista (404) y esté activa (422
 * `MARCA_INACTIVA`). `PRODUCTO_CREADO` se registra en la misma transacción.
 */
export class CrearProductoCasoUso {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly marcas: DirectorioMarcas,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosCrearProducto): Promise<VistaProducto> {
    return this.unidadTrabajo.ejecutar(async () => {
      const producto = Producto.crear({
        id: this.generadorId.generar(),
        nombre: datos.nombre,
        marcaId: datos.marcaId,
        precio: datos.precio,
        descripcion: datos.descripcion,
        disponibilidad: datos.disponibilidad,
        ahora: this.reloj.ahora(),
      });

      const marca = await this.marcas.buscarPorId(producto.marcaId);
      if (marca === null) {
        throw new MarcaNoEncontradaError();
      }
      if (!marca.activa) {
        throw new MarcaInactivaError();
      }

      await this.productos.crear(producto);
      await this.auditoria.registrar({
        accion: 'PRODUCTO_CREADO',
        idUsuario: datos.idVendedor,
        entidad: 'PRODUCTO',
        idEntidad: producto.id,
        detalle: { marcaId: producto.marcaId },
      });
      return { producto: producto.aPublico(), marca };
    });
  }
}
