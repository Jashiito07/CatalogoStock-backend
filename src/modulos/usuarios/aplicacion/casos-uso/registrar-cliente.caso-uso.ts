import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import { verificarAceptacionPrivacidad } from '../../dominio/aviso-privacidad.js';
import { validarFortalezaClave } from '../../dominio/clave.js';
import { Correo } from '../../dominio/correo.js';
import { CorreoYaRegistradoError } from '../../dominio/errores-usuario.js';
import { NombreUsuario } from '../../dominio/nombre-usuario.js';
import { Telefono } from '../../dominio/telefono.js';
import { Usuario, type UsuarioPublico } from '../../dominio/usuario.js';
import type { FuenteAvisoPrivacidad } from '../puertos/fuente-aviso-privacidad.puerto.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/**
 * Datos del registro tal como llegan. No hay campo `rol`: el registro público
 * solo crea Clientes (D-07) y la API rechaza un `rol` enviado (400).
 */
export interface DatosRegistrarCliente {
  nombre: string;
  correo: string;
  telefono: string;
  clave: string;
  aceptaPrivacidad: boolean;
  versionPrivacidad: string;
}

export const MENSAJE_DATOS_INVALIDOS = 'Los datos enviados no son válidos.';

interface ErrorDeCampo {
  campo: string;
  errores: string[];
}

function esListaErroresCampo(valor: unknown): valor is ErrorDeCampo[] {
  return Array.isArray(valor);
}

/**
 * Ejecuta cada validación de campo y junta **todos** los errores en un único
 * `DATOS_INVALIDOS`, como hace el ValidationPipe (contrato: `detalles.errores`
 * lista los campos). Nunca incluye los valores recibidos.
 */
function validarCampos<T extends Record<string, () => unknown>>(
  validaciones: T,
): { [K in keyof T]: ReturnType<T[K]> } {
  const resultado: Record<string, unknown> = {};
  const errores: ErrorDeCampo[] = [];
  for (const [campo, validar] of Object.entries(validaciones)) {
    try {
      resultado[campo] = validar();
    } catch (error) {
      const deCampo =
        error instanceof DatosInvalidosError
          ? error.detalles?.errores
          : undefined;
      if (esListaErroresCampo(deCampo)) {
        errores.push(...deCampo);
        continue;
      }
      throw error;
    }
  }
  if (errores.length > 0) {
    throw new DatosInvalidosError(MENSAJE_DATOS_INVALIDOS, { errores });
  }
  return resultado as { [K in keyof T]: ReturnType<T[K]> };
}

/**
 * Registro público del Cliente (RF-USU-01, RF-USU-02, RNF-02, RNF-16, D-07, D-11).
 *
 * 1. Valida nombre, correo, celular de Ecuador (D-14) y la fortaleza de la
 *    clave (D-22); todos los errores juntos → 400 `DATOS_INVALIDOS`.
 * 2. Exige aceptar el aviso de privacidad **vigente** → 422
 *    `PRIVACIDAD_NO_ACEPTADA` o `PRIVACIDAD_DESACTUALIZADA`.
 * 3. Correo ya registrado (sin importar mayúsculas) → 409 `CORREO_YA_REGISTRADO`.
 * 4. Crea siempre un usuario con rol `CLIENTE` y guarda solo el hash de la clave.
 *
 * No inicia sesión: la app llama después a `/autenticacion/ingreso/cliente`.
 */
export class RegistrarClienteCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly generadorHash: GeneradorHash,
    private readonly avisoPrivacidad: FuenteAvisoPrivacidad,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(datos: DatosRegistrarCliente): Promise<UsuarioPublico> {
    const campos = validarCampos({
      nombre: () => NombreUsuario.crear(datos.nombre),
      correo: () => Correo.crear(datos.correo),
      telefono: () => Telefono.crear(datos.telefono),
      clave: () => validarFortalezaClave(datos.clave),
    });

    const vigente = this.avisoPrivacidad.obtenerVigente();
    verificarAceptacionPrivacidad(
      datos.aceptaPrivacidad,
      datos.versionPrivacidad,
      vigente,
    );

    if (await this.usuarios.buscarPorCorreo(campos.correo)) {
      throw new CorreoYaRegistradoError();
    }

    const cliente = Usuario.crearCliente({
      id: this.generadorId.generar(),
      nombre: campos.nombre,
      correo: campos.correo,
      telefono: campos.telefono,
      hashClave: await this.generadorHash.generar(campos.clave),
      versionPrivacidad: vigente.version,
      ahora: this.reloj.ahora(),
    });

    // Si otro registro con el mismo correo gana la carrera, el índice único
    // hace que `crear` falle con CorreoYaRegistradoError (409).
    await this.usuarios.crear(cliente);
    // PENDIENTE (subfase 1.5): registrar `USUARIO_REGISTRADO` con
    // `{ idUsuario: cliente.id, entidad: 'USUARIO', idEntidad: cliente.id,
    // detalle: { rol: 'CLIENTE' } }` en la misma transacción que `crear`.

    return cliente.aPublico();
  }
}
