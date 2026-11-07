import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { type Canal, rolPermitidoEnCanal } from '../../dominio/canal.js';
import { BYTES_MAXIMOS_CLAVE, bytesUtf8 } from '../../dominio/clave.js';
import { Correo } from '../../dominio/correo.js';
import {
  CredencialesInvalidasError,
  type MotivoIngresoFallido,
} from '../../dominio/errores-autenticacion.js';
import { Sesion } from '../../dominio/sesion.js';
import type { Usuario } from '../../dominio/usuario.js';
import {
  componerSesionEmitida,
  type SesionEmitida,
} from '../dto/sesion-emitida.js';
import type { ConfiguracionSesion } from '../puertos/configuracion-sesion.js';
import type { EmisorTokenAcceso } from '../puertos/emisor-token-acceso.puerto.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { GeneradorTokenRenovacion } from '../puertos/generador-token-renovacion.puerto.js';
import type { SesionRepositorio } from '../puertos/sesion.repositorio.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

export interface DatosIniciarSesion {
  canal: Canal;
  correo: string;
  clave: string;
}

/**
 * Clave que solo sirve para calcular un hash ficticio con el mismo costo que
 * los reales. Ninguna cuenta la tiene: compararla nunca abre una sesión.
 */
const CLAVE_FICTICIA = 'clave-ficticia-solo-para-igualar-tiempos-0';

/**
 * Inicio de sesión por canal (RF-USU-01, CA-01, D-09, D-19).
 *
 * - `APP` solo acepta Clientes y `PANEL` solo al Vendedor. Con el rol
 *   equivocado **no se crea ninguna sesión** y se responde lo mismo que con
 *   una clave incorrecta (401 `CREDENCIALES_INVALIDAS`, «Correo o clave
 *   incorrectos.»), para no revelar que la cuenta existe.
 * - Primero se verifica la clave y después el rol (contrato de usuarios).
 * - Si el correo no existe se compara contra un hash ficticio, para que el
 *   tiempo de respuesta sea similar al de una clave incorrecta.
 * - Al acertar: JWT de acceso de 15 min y token de renovación de 7 días cuyo
 *   hash se guarda en `sesiones` con su canal y una familia de rotación nueva.
 * - Bitácora (RF-USU-04, D-20): `SESION_INICIADA` en la misma transacción que
 *   la sesión; `SESION_FALLIDA` (correo intentado, canal y motivo) fuera de
 *   transacción y sin alterar el 401.
 */
export class IniciarSesionCasoUso {
  #hashFicticio: Promise<string> | undefined;

  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly sesiones: SesionRepositorio,
    private readonly generadorHash: GeneradorHash,
    private readonly emisorAcceso: EmisorTokenAcceso,
    private readonly generadorToken: GeneradorTokenRenovacion,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly configuracion: ConfiguracionSesion,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosIniciarSesion): Promise<SesionEmitida> {
    const usuario = await this.buscarUsuario(datos.correo);
    const claveValida = await this.compararClave(datos.clave, usuario);

    if (usuario === null || !claveValida || !usuario.activo) {
      throw await this.rechazar(datos, usuario, 'CREDENCIALES_INVALIDAS');
    }
    if (!rolPermitidoEnCanal(usuario.rol, datos.canal)) {
      // D-19: rol equivocado en el canal → mismo 401 y sin sesión.
      throw await this.rechazar(datos, usuario, 'ROL_NO_PERMITIDO');
    }

    const ahora = this.reloj.ahora();
    const tokenRenovacion = this.generadorToken.generar();
    const sesion = Sesion.iniciar({
      id: this.generadorId.generar(),
      idUsuario: usuario.id,
      familia: this.generadorId.generar(),
      canal: datos.canal,
      hashToken: this.generadorToken.calcularHash(tokenRenovacion),
      ahora,
      vidaDias: this.configuracion.vidaRenovacionDias,
    });
    // RF-USU-04: la sesión y su `SESION_INICIADA` se guardan juntas o ninguna.
    await this.unidadTrabajo.ejecutar(async () => {
      await this.sesiones.crear(sesion);
      await this.auditoria.registrar({
        accion: 'SESION_INICIADA',
        idUsuario: usuario.id,
        entidad: 'SESION',
        idEntidad: sesion.id,
        detalle: { rol: usuario.rol, canal: datos.canal },
      });
    });

    const acceso = await this.emisorAcceso.emitir(
      { idUsuario: usuario.id, rol: usuario.rol },
      ahora,
    );
    return componerSesionEmitida(acceso, tokenRenovacion, sesion, usuario);
  }

  /**
   * D-20: registra `SESION_FALLIDA` con el correo intentado (la bitácora lo
   * normaliza a minúsculas y lo recorta a 254), el canal, el motivo y el id
   * del usuario si la cuenta existe; **nunca** la clave. Se registra fuera de
   * transacción y sin interrumpir: si la bitácora falla, la respuesta sigue
   * siendo el mismo 401 (el motivo nunca llega a la respuesta).
   */
  private async rechazar(
    datos: DatosIniciarSesion,
    usuario: Usuario | null,
    motivo: MotivoIngresoFallido,
  ): Promise<CredencialesInvalidasError> {
    await this.auditoria.registrarSinInterrumpir({
      accion: 'SESION_FALLIDA',
      idUsuario: usuario?.id ?? null,
      entidad: 'SESION',
      idEntidad: null,
      detalle: { correo: datos.correo, canal: datos.canal, motivo },
    });
    return new CredencialesInvalidasError(motivo);
  }

  /** Un correo con formato inválido se trata como inexistente (mismo 401). */
  private async buscarUsuario(correo: string): Promise<Usuario | null> {
    let normalizado: Correo;
    try {
      normalizado = Correo.crear(correo);
    } catch {
      return null;
    }
    return this.usuarios.buscarPorCorreo(normalizado);
  }

  /**
   * Siempre ejecuta una comparación bcrypt (con el hash real o el ficticio).
   * Una clave de más de 72 bytes nunca es válida (D-22): bcrypt ignoraría el
   * resto y aceptaría una clave distinta de la registrada.
   */
  private async compararClave(
    clave: string,
    usuario: Usuario | null,
  ): Promise<boolean> {
    const hash = usuario?.hashClave ?? (await this.obtenerHashFicticio());
    const coincide = await this.generadorHash.comparar(clave, hash);
    return (
      usuario !== null && coincide && bytesUtf8(clave) <= BYTES_MAXIMOS_CLAVE
    );
  }

  private obtenerHashFicticio(): Promise<string> {
    this.#hashFicticio ??= this.generadorHash.generar(CLAVE_FICTICIA);
    return this.#hashFicticio;
  }
}
