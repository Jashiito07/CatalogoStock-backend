import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import {
  type EntradaPerfilVendedor,
  PAIS_TIENDA,
  PerfilVendedor,
  type ProvinciaEcuador,
  TiendaNoConfiguradaError,
} from '../../dominio/perfil-vendedor.js';
import type { PerfilVendedorRepositorio } from '../puertos/perfil-vendedor.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/** Perfil del Vendedor para la API; con todos los campos `null` si aún no existe (RF-USU-08). */
export interface VistaPerfilVendedor {
  nombreComercial: string | null;
  ciudad: string | null;
  provincia: ProvinciaEcuador | null;
  whatsapp: string | null;
}

export interface VistaTienda {
  nombreComercial: string;
  ciudad: string;
  provincia: ProvinciaEcuador;
  pais: typeof PAIS_TIENDA;
  whatsapp: string;
}

/** `GET /vendedor/perfil`: el perfil del Vendedor del token o todos los campos `null`. */
export class ObtenerPerfilVendedorCasoUso {
  constructor(private readonly perfiles: PerfilVendedorRepositorio) {}

  async ejecutar(idVendedor: string): Promise<VistaPerfilVendedor> {
    const perfil = await this.perfiles.obtener(idVendedor);
    return {
      nombreComercial: perfil?.nombreComercial ?? null,
      ciudad: perfil?.ciudad ?? null,
      provincia: perfil?.provincia ?? null,
      whatsapp: perfil?.whatsapp ?? null,
    };
  }
}

/**
 * `PUT /vendedor/perfil`: crea o reemplaza el perfil del Vendedor del token (los
 * cuatro campos son obligatorios; 400 por campo). `PERFIL_VENDEDOR_ACTUALIZADO`
 * con solo los **nombres** de los campos que cambian, en la misma transacción.
 */
export class GuardarPerfilVendedorCasoUso {
  constructor(
    private readonly perfiles: PerfilVendedorRepositorio,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(
    idVendedor: string,
    entrada: EntradaPerfilVendedor,
  ): Promise<VistaPerfilVendedor> {
    const perfil = PerfilVendedor.crear(idVendedor, entrada, this.reloj.ahora());
    await this.unidadTrabajo.ejecutar(async () => {
      const anterior = await this.perfiles.obtener(idVendedor);
      await this.perfiles.guardar(perfil);
      await this.auditoria.registrar({
        accion: 'PERFIL_VENDEDOR_ACTUALIZADO',
        idUsuario: idVendedor,
        entidad: 'USUARIO',
        idEntidad: idVendedor,
        detalle: { campos: perfil.camposCambiados(anterior) },
      });
    });
    return {
      nombreComercial: perfil.nombreComercial,
      ciudad: perfil.ciudad,
      provincia: perfil.provincia,
      whatsapp: perfil.whatsapp,
    };
  }
}

/**
 * `GET /tienda` (usuarios con sesión): el perfil del **único** Vendedor. 404
 * `TIENDA_NO_CONFIGURADA` si aún no lo completó.
 */
export class ConsultarTiendaCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly perfiles: PerfilVendedorRepositorio,
  ) {}

  async ejecutar(): Promise<VistaTienda> {
    const vendedor = await this.usuarios.buscarVendedor();
    const perfil =
      vendedor === null ? null : await this.perfiles.obtener(vendedor.id);
    if (perfil === null) {
      throw new TiendaNoConfiguradaError();
    }
    return {
      nombreComercial: perfil.nombreComercial,
      ciudad: perfil.ciudad,
      provincia: perfil.provincia,
      pais: PAIS_TIENDA,
      whatsapp: perfil.whatsapp,
    };
  }
}
