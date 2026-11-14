import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  MarcaDuplicadaError,
  MarcaNoEncontradaError,
} from '../../dominio/errores-marca.js';
import type { CambiosMarca, MarcaPublica } from '../../dominio/marca.js';
import { NombreMarca } from '../../dominio/nombre-marca.js';
import type { MarcaRepositorio } from '../puertos/marca.repositorio.js';

export interface DatosActualizarMarca {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  idMarca: string;
  /** `undefined` = sin cambio; `colorAcento: null` quita el acento. */
  cambios: CambiosMarca;
}

/**
 * Cambia parcialmente una marca (RF-PRO-04). No existe eliminar: se
 * desactiva con `activa: false`. `MARCA_ACTUALIZADA` guarda solo los nombres
 * de los campos que cambiaron, en la misma transacción. Si nada cambia, no
 * escribe ni registra.
 */
export class ActualizarMarcaCasoUso {
  constructor(
    private readonly marcas: MarcaRepositorio,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosActualizarMarca): Promise<MarcaPublica> {
    return this.unidadTrabajo.ejecutar(async () => {
      const actual = await this.marcas.buscarPorId(datos.idMarca);
      if (actual === null) {
        throw new MarcaNoEncontradaError();
      }
      const { marca, campos } = actual.aplicar(
        datos.cambios,
        this.reloj.ahora(),
      );
      if (campos.length === 0) {
        return marca.aPublica();
      }

      if (campos.includes('nombre')) {
        const clave = NombreMarca.crear(datos.cambios.nombre).clave;
        const existente = await this.marcas.buscarPorClaveNombre(clave);
        if (existente !== null && existente.id !== marca.id) {
          throw new MarcaDuplicadaError();
        }
      }
      await this.marcas.guardar(marca);
      await this.auditoria.registrar({
        accion: 'MARCA_ACTUALIZADA',
        idUsuario: datos.idVendedor,
        entidad: 'MARCA',
        idEntidad: marca.id,
        detalle: { campos },
      });
      return marca.aPublica();
    });
  }
}
