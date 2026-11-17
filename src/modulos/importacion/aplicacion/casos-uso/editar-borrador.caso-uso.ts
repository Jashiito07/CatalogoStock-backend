import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import { validarMarcaId } from '../../../productos/validaciones.js';
import type { BorradorPublico, CambiosBorrador } from '../../dominio/borrador.js';
import {
  BorradorNoEncontradoError,
  MarcaInactivaError,
  MarcaNoEncontradaError,
} from '../../dominio/errores-importacion.js';
import type { BorradorRepositorio } from '../puertos/borrador.repositorio.js';
import type { DirectorioMarcas } from '../puertos/directorio-marcas.puerto.js';

export interface DatosEditarBorrador {
  idBorrador: string;
  cambios: CambiosBorrador;
}

/**
 * `PATCH /productos/importaciones/borradores/{id}` (RF-PRO-01, RN-11): cambia
 * nombre, descripción, precio, marca o disponibilidad con las mismas
 * validaciones que `POST /productos` (400), recalcula las advertencias y solo
 * actúa sobre un borrador `PENDIENTE` (422 `BORRADOR_NO_EDITABLE`). Una marca
 * nueva debe existir (404) y estar activa (422 `MARCA_INACTIVA`). El borrador
 * se bloquea durante la transacción.
 */
export class EditarBorradorCasoUso {
  constructor(
    private readonly borradores: BorradorRepositorio,
    private readonly marcas: DirectorioMarcas,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
  ) {}

  async ejecutar(datos: DatosEditarBorrador): Promise<BorradorPublico> {
    return this.unidadTrabajo.ejecutar(async () => {
      const actual = await this.borradores.bloquearPorId(datos.idBorrador);
      if (actual === null) {
        throw new BorradorNoEncontradoError();
      }
      const { borrador, campos } = actual.editar(
        datos.cambios,
        this.reloj.ahora(),
      );
      if (campos.includes('marcaId')) {
        const marca = await this.marcas.buscarPorId(
          validarMarcaId(datos.cambios.marcaId),
        );
        if (marca === null) {
          throw new MarcaNoEncontradaError();
        }
        if (!marca.activa) {
          throw new MarcaInactivaError();
        }
      }
      if (campos.length > 0) {
        await this.borradores.guardar(borrador);
      }
      return borrador.aPublico();
    });
  }
}
