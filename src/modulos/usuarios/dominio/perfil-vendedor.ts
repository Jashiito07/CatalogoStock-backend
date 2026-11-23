import { ErrorDominio } from '../../../compartido/dominio/errores.js';
import { errorDeCampo } from './error-campo.js';
import { Telefono } from './telefono.js';

/**
 * Perfil comercial del Vendedor (RF-USU-08; contrato cuenta-y-politicas, §3).
 * TypeScript puro. Lo muestra la app en «Contactar por WhatsApp»; el número
 * solo se entrega a usuarios con sesión.
 */

export const LONGITUD_MINIMA_NOMBRE_COMERCIAL = 2;
export const LONGITUD_MAXIMA_NOMBRE_COMERCIAL = 80;
export const LONGITUD_MINIMA_CIUDAD = 2;
export const LONGITUD_MAXIMA_CIUDAD = 60;

export const MENSAJE_NOMBRE_COMERCIAL_INVALIDO =
  'Ingrese el nombre comercial (2 a 80 caracteres).';
export const MENSAJE_CIUDAD_INVALIDA = 'Ingrese la ciudad (2 a 60 caracteres).';
export const MENSAJE_PROVINCIA_INVALIDA =
  'Elija una de las 24 provincias del Ecuador.';
export const MENSAJE_WHATSAPP_INVALIDO =
  'El WhatsApp debe ser un celular de Ecuador válido, por ejemplo 0991234567.';

/** País de la tienda: la versión 1 solo opera en Ecuador. */
export const PAIS_TIENDA = 'EC';

/** Las 24 provincias del Ecuador (lista fija; contrato cuenta-y-politicas, §3). */
export const PROVINCIAS_ECUADOR = [
  'Azuay',
  'Bolívar',
  'Cañar',
  'Carchi',
  'Chimborazo',
  'Cotopaxi',
  'El Oro',
  'Esmeraldas',
  'Galápagos',
  'Guayas',
  'Imbabura',
  'Loja',
  'Los Ríos',
  'Manabí',
  'Morona Santiago',
  'Napo',
  'Orellana',
  'Pastaza',
  'Pichincha',
  'Santa Elena',
  'Santo Domingo de los Tsáchilas',
  'Sucumbíos',
  'Tungurahua',
  'Zamora Chinchipe',
] as const;

export type ProvinciaEcuador = (typeof PROVINCIAS_ECUADOR)[number];

/** Campos del perfil, en el orden en que se registran en la bitácora. */
export const CAMPOS_PERFIL_VENDEDOR = [
  'nombreComercial',
  'ciudad',
  'provincia',
  'whatsapp',
] as const;

export type CampoPerfilVendedor = (typeof CAMPOS_PERFIL_VENDEDOR)[number];

function sinTildes(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Texto de `minimo` a `maximo` caracteres tras recortar y unir espacios repetidos. */
function validarTexto(
  campo: CampoPerfilVendedor,
  entrada: unknown,
  minimo: number,
  maximo: number,
  mensaje: string,
): string {
  if (typeof entrada !== 'string') {
    throw errorDeCampo(campo, mensaje);
  }
  const limpio = entrada.trim().replace(/\s+/g, ' ');
  // Se cuentan puntos de código, no unidades UTF-16.
  const longitud = [...limpio].length;
  if (longitud < minimo || longitud > maximo) {
    throw errorDeCampo(campo, mensaje);
  }
  return limpio;
}

export function validarNombreComercial(entrada: unknown): string {
  return validarTexto(
    'nombreComercial',
    entrada,
    LONGITUD_MINIMA_NOMBRE_COMERCIAL,
    LONGITUD_MAXIMA_NOMBRE_COMERCIAL,
    MENSAJE_NOMBRE_COMERCIAL_INVALIDO,
  );
}

export function validarCiudad(entrada: unknown): string {
  return validarTexto(
    'ciudad',
    entrada,
    LONGITUD_MINIMA_CIUDAD,
    LONGITUD_MAXIMA_CIUDAD,
    MENSAJE_CIUDAD_INVALIDA,
  );
}

/** Acepta la provincia sin importar mayúsculas ni tildes y devuelve su nombre oficial. */
export function validarProvincia(entrada: unknown): ProvinciaEcuador {
  if (typeof entrada === 'string') {
    const buscada = sinTildes(entrada.trim().replace(/\s+/g, ' '));
    const provincia = PROVINCIAS_ECUADOR.find(
      (candidata) => sinTildes(candidata) === buscada,
    );
    if (provincia !== undefined) {
      return provincia;
    }
  }
  throw errorDeCampo('provincia', MENSAJE_PROVINCIA_INVALIDA);
}

/** Mismas reglas y normalización que el `telefono` de la cuenta: E.164 de un celular de Ecuador. */
export function validarWhatsapp(entrada: unknown): string {
  try {
    return Telefono.crear(entrada).valor;
  } catch {
    throw errorDeCampo('whatsapp', MENSAJE_WHATSAPP_INVALIDO);
  }
}

export interface DatosPerfilVendedor {
  nombreComercial: string;
  ciudad: string;
  provincia: ProvinciaEcuador;
  /** Celular de Ecuador en E.164 (`+5939XXXXXXXX`). */
  whatsapp: string;
}

export interface EntradaPerfilVendedor {
  nombreComercial: unknown;
  ciudad: unknown;
  provincia: unknown;
  whatsapp: unknown;
}

/** El perfil comercial del Vendedor con todos sus campos válidos. Inmutable. */
export class PerfilVendedor {
  private constructor(
    readonly idUsuario: string,
    readonly datos: DatosPerfilVendedor,
    readonly actualizadoEn: Date,
  ) {}

  /** Valida los cuatro campos (los cuatro son obligatorios). */
  static crear(
    idUsuario: string,
    entrada: EntradaPerfilVendedor,
    ahora: Date,
  ): PerfilVendedor {
    return new PerfilVendedor(
      idUsuario,
      {
        nombreComercial: validarNombreComercial(entrada.nombreComercial),
        ciudad: validarCiudad(entrada.ciudad),
        provincia: validarProvincia(entrada.provincia),
        whatsapp: validarWhatsapp(entrada.whatsapp),
      },
      ahora,
    );
  }

  /** Reconstruye un perfil guardado (capa de persistencia). */
  static reconstituir(
    idUsuario: string,
    datos: DatosPerfilVendedor,
    actualizadoEn: Date,
  ): PerfilVendedor {
    return new PerfilVendedor(idUsuario, { ...datos }, actualizadoEn);
  }

  get nombreComercial(): string {
    return this.datos.nombreComercial;
  }
  get ciudad(): string {
    return this.datos.ciudad;
  }
  get provincia(): ProvinciaEcuador {
    return this.datos.provincia;
  }
  get whatsapp(): string {
    return this.datos.whatsapp;
  }

  /**
   * Nombres de los campos que cambian respecto de `anterior` (todos si no había
   * perfil). Solo nombres: nunca los valores (D-20, RF-USU-08).
   */
  camposCambiados(anterior: PerfilVendedor | null): CampoPerfilVendedor[] {
    return CAMPOS_PERFIL_VENDEDOR.filter(
      (campo) => anterior === null || anterior.datos[campo] !== this.datos[campo],
    );
  }
}

export const MENSAJE_TIENDA_NO_CONFIGURADA =
  'La tienda todavía no está configurada.';

/** 404 `TIENDA_NO_CONFIGURADA`: el Vendedor aún no completó su perfil comercial. */
export class TiendaNoConfiguradaError extends ErrorDominio {
  readonly categoria = 'NO_ENCONTRADO';

  constructor() {
    super('TIENDA_NO_CONFIGURADA', MENSAJE_TIENDA_NO_CONFIGURADA);
  }
}
