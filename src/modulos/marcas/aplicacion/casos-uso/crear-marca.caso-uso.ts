import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { MarcaDuplicadaError } from '../../dominio/errores-marca.js';
import { Marca, type MarcaPublica } from '../../dominio/marca.js';
import type { MarcaRepositorio } from '../puertos/marca.repositorio.js';

export interface DatosCrearMarca {
  /** Vendedor del token (ya verificado por `@Roles('VENDEDOR')`). */
  idVendedor: string;
  nombre: unknown;
  color: unknown;
  colorAcento?: unknown;
  /** Opcional: por defecto, al final. */
  orden?: unknown;
}

/**
 * Crea una marca (RF-PRO-04, RF-PRO-06). El nombre es único sin distinguir
 * mayúsculas ni tildes (409 `MARCA_DUPLICADA`). `MARCA_CREADA` se registra en
 * la misma transacción.
 */
export class CrearMarcaCasoUso {
  constructor(
    private readonly marcas: MarcaRepositorio,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosCrearMarca): Promise<MarcaPublica> {
    return this.unidadTrabajo.ejecutar(async () => {
      const orden = datos.orden ?? (await this.marcas.siguienteOrden());
      const marca = Marca.crear({
        id: this.generadorId.generar(),
        nombre: datos.nombre,
        color: datos.color,
        colorAcento: datos.colorAcento,
        orden,
        ahora: this.reloj.ahora(),
      });

      if (
        (await this.marcas.buscarPorClaveNombre(marca.nombre.clave)) !== null
      ) {
        throw new MarcaDuplicadaError();
      }
      await this.marcas.crear(marca);
      await this.auditoria.registrar({
        accion: 'MARCA_CREADA',
        idUsuario: datos.idVendedor,
        entidad: 'MARCA',
        idEntidad: marca.id,
        detalle: { nombre: marca.nombre.valor },
      });
      return marca.aPublica();
    });
  }
}
