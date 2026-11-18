import { claveDeEmparejamiento } from '../../productos/validaciones.js';
import type { Importacion, TotalesImportacion } from '../dominio/importacion.js';
import type { BorradorRepositorio } from './puertos/borrador.repositorio.js';
import type { ProductosExistentes } from './puertos/productos-existentes.puerto.js';

/**
 * Calcula los totales de una importación (contrato de importación,
 * «Importación»; D-57): los conteos por estado y, con ayuda de `productos`,
 * cuántos pendientes actualizarán un producto (`actualizaran`), cuántos lo
 * crearán (`nuevos`) y cuántos productos de la marca con código no aparecen en
 * el catálogo (`ausentes`, solo en la vigente). Solo lectura.
 */
export class CalculadorTotalesImportacion {
  constructor(
    private readonly borradores: BorradorRepositorio,
    private readonly productos: ProductosExistentes,
  ) {}

  async calcular(importacion: Importacion): Promise<TotalesImportacion> {
    const base = await this.borradores.totales(importacion.id);
    const actualizaran = await this.contarQueActualizan(importacion.id);
    return {
      ...base,
      actualizaran,
      nuevos: base.pendientes - actualizaran,
      ausentes: await this.contarAusentes(importacion),
    };
  }

  /**
   * Pendientes que actualizarán un producto: los que traen un código que ya
   * existe en la marca del borrador y los sin código emparejados por nombre.
   */
  private async contarQueActualizan(idImportacion: string): Promise<number> {
    const pendientes = await this.borradores.pendientesPorCodigo(idImportacion);
    const codigosPorMarca = new Map<string, Set<string>>();
    for (const { marcaId, codigo } of pendientes) {
      const codigos = codigosPorMarca.get(marcaId) ?? new Set<string>();
      codigos.add(codigo);
      codigosPorMarca.set(marcaId, codigos);
    }
    const existentesPorMarca = new Map<string, Set<string>>();
    for (const [marcaId, codigos] of codigosPorMarca) {
      existentesPorMarca.set(
        marcaId,
        await this.productos.codigosExistentes(marcaId, [...codigos]),
      );
    }
    const porCodigo = pendientes.reduce(
      (suma, { marcaId, codigo, cantidad }) =>
        existentesPorMarca.get(marcaId)?.has(codigo) ? suma + cantidad : suma,
      0,
    );
    return porCodigo + (await this.contarQueActualizanPorNombre(idImportacion));
  }

  /**
   * Pendientes sin código que se emparejan por nombre con **exactamente un**
   * producto sin código de su marca (D-57); los ambiguos y los de nombre
   * dudoso cuentan como `nuevos`.
   */
  private async contarQueActualizanPorNombre(
    idImportacion: string,
  ): Promise<number> {
    const sinCodigo = await this.borradores.pendientesSinCodigo(idImportacion);
    const nombresPorMarca = new Map<string, Set<string>>();
    for (const { marcaId, nombre, nombreDudoso } of sinCodigo) {
      if (!nombreDudoso && claveDeEmparejamiento(nombre) !== '') {
        const nombres = nombresPorMarca.get(marcaId) ?? new Set<string>();
        nombres.add(nombre);
        nombresPorMarca.set(marcaId, nombres);
      }
    }
    const productosPorClave = new Map<string, number>();
    for (const [marcaId, nombres] of nombresPorMarca) {
      for (const producto of await this.productos.buscarSinCodigoPorNombres(
        marcaId,
        [...nombres],
      )) {
        const clave = `${marcaId}:${claveDeEmparejamiento(producto.nombre)}`;
        productosPorClave.set(clave, (productosPorClave.get(clave) ?? 0) + 1);
      }
    }
    return sinCodigo.filter(
      ({ marcaId, nombre, nombreDudoso }) =>
        !nombreDudoso &&
        productosPorClave.get(`${marcaId}:${claveDeEmparejamiento(nombre)}`) === 1,
    ).length;
  }

  private async contarAusentes(importacion: Importacion): Promise<number> {
    if (importacion.estaArchivada) {
      return 0;
    }
    const codigos = await this.borradores.codigosDeImportacion(importacion.id);
    const pagina = await this.productos.listarAusentes(
      importacion.marcaId,
      codigos,
      { pagina: 1, tamanio: 1 },
    );
    return pagina.total;
  }
}
