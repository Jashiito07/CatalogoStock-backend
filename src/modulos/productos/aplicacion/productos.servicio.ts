import type {
  Pagina,
  Paginacion,
} from '../../../compartido/dominio/paginacion.js';
import { claveDeEmparejamiento } from '../dominio/busqueda.js';
import type { ProductoPublico } from '../dominio/producto.js';
import type { ActualizarProductoCasoUso } from './casos-uso/actualizar-producto.caso-uso.js';
import type {
  CrearProductoCasoUso,
  DatosCrearProducto,
} from './casos-uso/crear-producto.caso-uso.js';
import type { ProductoRepositorio } from './puertos/producto.repositorio.js';

/**
 * Servicio público del módulo `productos` para los demás módulos del backend
 * (imágenes en 2.4; importación del catálogo en 2.8 y catálogos mensuales,
 * D-57; carrito, pedidos e inventario más adelante). Ningún otro módulo
 * accede a la tabla `productos`.
 */
export class ProductosServicio {
  constructor(
    private readonly productos: ProductoRepositorio,
    private readonly crearProducto: CrearProductoCasoUso,
    private readonly actualizarProducto: ActualizarProductoCasoUso,
  ) {}

  /** El producto no eliminado o `null` (un eliminado se trata como inexistente, PA-07). */
  async buscarPorId(id: string): Promise<ProductoPublico | null> {
    const producto = await this.productos.buscarPorId(id);
    return producto === null ? null : producto.aPublico();
  }

  /**
   * Crea un producto con exactamente las mismas validaciones y la misma
   * bitácora (`PRODUCTO_CREADO`) que `POST /productos` (RF-PRO-01, CA-04).
   * Si se llama dentro de una unidad de trabajo, se une a su transacción (la
   * importación del catálogo aprueba cada borrador así, 2.8). Falla con
   * `CODIGO_DUPLICADO` si el código ya existe en la marca (D-57).
   */
  async crear(datos: DatosCrearProducto): Promise<ProductoPublico> {
    const vista = await this.crearProducto.ejecutar(datos);
    return vista.producto;
  }

  /** Los productos no eliminados del Vendedor en la marca con alguno de esos códigos (D-57, D-60). */
  async buscarPorCodigos(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<ProductoPublico[]> {
    const encontrados = await this.productos.buscarPorCodigos(
      idVendedor,
      marcaId,
      codigos,
    );
    return encontrados.map((producto) => producto.aPublico());
  }

  /** Entre `codigos`, los que ya tienen un producto no eliminado del Vendedor en la marca (D-57, D-60). */
  codigosExistentes(
    idVendedor: string,
    marcaId: string,
    codigos: readonly string[],
  ): Promise<Set<string>> {
    return this.productos.codigosExistentes(idVendedor, marcaId, codigos);
  }

  /**
   * El producto no eliminado del Vendedor en la marca con ese código,
   * **bloqueado** hasta el fin de la transacción en curso: serializa las
   * aprobaciones del mismo código (D-57, D-60). Llamar solo dentro de una
   * unidad de trabajo.
   */
  async bloquearPorCodigo(
    idVendedor: string,
    marcaId: string,
    codigo: string,
  ): Promise<ProductoPublico | null> {
    const producto = await this.productos.bloquearPorCodigo(
      idVendedor,
      marcaId,
      codigo,
    );
    return producto === null ? null : producto.aPublico();
  }

  /**
   * Productos no eliminados del Vendedor en la marca **sin código** cuyo nombre
   * coincide con alguno de `nombres` sin distinguir mayúsculas, tildes ni
   * signos (D-57, emparejado por nombre). Nunca devuelve productos que tienen
   * código.
   */
  async buscarSinCodigoPorNombres(
    idVendedor: string,
    marcaId: string,
    nombres: readonly string[],
  ): Promise<ProductoPublico[]> {
    const claves = [
      ...new Set(nombres.map(claveDeEmparejamiento).filter((c) => c !== '')),
    ];
    const encontrados = await this.productos.buscarSinCodigoPorClaves(
      idVendedor,
      marcaId,
      claves,
    );
    return encontrados.map((producto) => producto.aPublico());
  }

  /**
   * Como `buscarSinCodigoPorNombres` para un nombre, **bloqueando** lo
   * encontrado hasta el fin de la transacción en curso (y serializando a
   * quienes aprueban el mismo nombre). Llamar solo dentro de una unidad de trabajo.
   */
  async bloquearSinCodigoPorNombre(
    idVendedor: string,
    marcaId: string,
    nombre: string,
  ): Promise<ProductoPublico[]> {
    const clave = claveDeEmparejamiento(nombre);
    if (clave === '') {
      return [];
    }
    return (
      await this.productos.bloquearSinCodigoPorClave(idVendedor, marcaId, clave)
    ).map((producto) => producto.aPublico());
  }

  /**
   * Cambia **solo el precio** de un producto, con la misma validación y la
   * misma bitácora (`PRODUCTO_ACTUALIZADO` con `precioAnterior` y
   * `precioNuevo`) que `PATCH /productos/{id}`; si el precio es igual, no
   * escribe nada (D-57, PA-07: los pedidos ya hechos conservan su precio).
   */
  async actualizarPrecio(datos: {
    idVendedor: string;
    idProducto: string;
    precio: string;
  }): Promise<void> {
    await this.actualizarProducto.ejecutar({
      idVendedor: datos.idVendedor,
      idProducto: datos.idProducto,
      cambios: { precio: datos.precio },
    });
  }

  /**
   * Productos de la marca con código y no eliminados cuyo código **no** está
   * en `codigosPresentes`: «ausentes» de un catálogo nuevo (D-57). Solo lectura.
   */
  async listarAusentes(
    idVendedor: string,
    marcaId: string,
    codigosPresentes: readonly string[],
    paginacion: Paginacion,
  ): Promise<Pagina<ProductoPublico>> {
    const pagina = await this.productos.listarAusentes(
      idVendedor,
      marcaId,
      codigosPresentes,
      paginacion,
    );
    return {
      ...pagina,
      elementos: pagina.elementos.map((producto) => producto.aPublico()),
    };
  }
}
