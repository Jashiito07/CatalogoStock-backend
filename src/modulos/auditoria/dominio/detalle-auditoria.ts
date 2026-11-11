import type { AccionAuditoria } from './catalogo-auditoria.js';

/**
 * Salvaguarda del `detalle` de la bitácora (contrato de auditoría, «Reglas»;
 * AGENTS.md, «Seguridad»; D-20). TypeScript puro.
 *
 * Nunca se guardan claves (ni la intentada), hashes, tokens, teléfonos, datos
 * bancarios, comprobantes ni el cuerpo de la solicitud. Solo identificadores,
 * códigos y estados. **Única excepción con dato personal (D-20):** el correo
 * intentado de `SESION_FALLIDA` y de `RECUPERACION_FALLIDA` (RF-USU-05), en
 * minúsculas y recortado a 254 caracteres.
 *
 * La salvaguarda **elimina** (no rechaza) lo prohibido: un descuido de quien
 * llama nunca guarda un dato sensible ni impide la operación de negocio; los
 * nombres de los campos descartados se devuelven para avisar en el log
 * técnico (nunca sus valores).
 */
export type ValorDetalle = string | number | boolean | null;

export type DetalleAuditoria = Readonly<Record<string, ValorDetalle>>;

export interface DetalleSaneado {
  readonly detalle: DetalleAuditoria;
  /** Campos eliminados (solo el nombre, recortado). */
  readonly descartados: readonly string[];
}

/** Contrato: el correo intentado se recorta a 254 caracteres (D-20). */
export const LONGITUD_MAXIMA_CORREO = 254;
/** Un texto más largo se recorta: la bitácora no guarda cuerpos ni volcados. */
export const LONGITUD_MAXIMA_TEXTO = 300;
export const CAMPOS_MAXIMOS = 20;
const LONGITUD_MAXIMA_NOMBRE_CAMPO = 50;

/** Nombre de campo admitido: identificador en camelCase. */
const PATRON_NOMBRE_CAMPO = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Fragmentos prohibidos en el nombre del campo, comparados sin mayúsculas,
 * tildes ni separadores (`hashClave`, `contraseña`, `refresh_token`…).
 */
const FRAGMENTOS_PROHIBIDOS = [
  'clave',
  'contrasena',
  'password',
  'passwd',
  'pwd',
  'hash',
  'token',
  'secreto',
  'secret',
  'jwt',
  'bearer',
  'authorization',
  'autorizacion',
  'cookie',
  'telefono',
  'celular',
  'phone',
  'tarjeta',
  'cvv',
  'cvc',
  'banco',
  'bancari',
  'comprobante',
  'cuerpo',
  'body',
  'cedula',
  'direccion',
  'correo',
  'email',
  'mail',
] as const;

/** Nombres exactos prohibidos (datos personales que no se copian, contrato). */
const NOMBRES_PROHIBIDOS = new Set([
  'nombre',
  'nombres',
  'apellido',
  'apellidos',
]);

/** Valores con forma de secreto o de dato personal, en cualquier campo. */
const PATRONES_VALOR_PROHIBIDO: readonly RegExp[] = [
  // Hash bcrypt.
  /\$2[abxy]\$\d{2}\$/,
  // JWT (cabecera `{"alg"…` en base64url).
  /eyJ[\w-]+\.[\w-]+\.[\w-]*/,
  // Correo electrónico.
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  // Celular de Ecuador (D-14), cédula o secuencias largas de dígitos
  // (tarjetas, cuentas).
  /\+593\d{9}/,
  /\d{10,}/,
  // Tokens opacos, hashes hexadecimales o base64 largos.
  /[A-Za-z0-9_+=-]{40,}/,
];

/**
 * Los UUID se permiten (son identificadores); se quitan antes de buscar
 * valores prohibidos para que su último grupo de 12 cifras no parezca un
 * número de cuenta.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function nombreProhibido(nombre: string): boolean {
  if (!PATRON_NOMBRE_CAMPO.test(nombre)) {
    return true;
  }
  if (nombre.length > LONGITUD_MAXIMA_NOMBRE_CAMPO) {
    return true;
  }
  const normalizado = normalizarNombre(nombre);
  return (
    NOMBRES_PROHIBIDOS.has(normalizado) ||
    FRAGMENTOS_PROHIBIDOS.some((fragmento) => normalizado.includes(fragmento))
  );
}

function esValorDetalle(valor: unknown): valor is ValorDetalle {
  return (
    valor === null ||
    typeof valor === 'string' ||
    typeof valor === 'boolean' ||
    (typeof valor === 'number' && Number.isFinite(valor))
  );
}

function valorProhibido(valor: ValorDetalle): boolean {
  if (typeof valor === 'number') {
    // Un número de tarjeta o de cuenta enviado como número.
    return /\d{10,}/.test(Math.abs(valor).toFixed(0));
  }
  if (typeof valor !== 'string') {
    return false;
  }
  const sinUuid = valor.replace(UUID, '-');
  return PATRONES_VALOR_PROHIBIDO.some((patron) => patron.test(sinUuid));
}

/** D-20: correo intentado sin espacios alrededor, en minúsculas y con 254 caracteres como máximo. */
export function normalizarCorreoIntentado(correo: string): string {
  return correo.trim().toLowerCase().slice(0, LONGITUD_MAXIMA_CORREO);
}

/**
 * D-20: la única excepción es el `correo` intentado de un acceso fallido:
 * `SESION_FALLIDA` y, con RF-USU-05, `RECUPERACION_FALLIDA` (contrato de
 * auditoría).
 */
const ACCIONES_CON_CORREO_INTENTADO: ReadonlySet<AccionAuditoria> = new Set([
  'SESION_FALLIDA',
  'RECUPERACION_FALLIDA',
]);

function esCorreoIntentado(accion: AccionAuditoria, nombre: string): boolean {
  return ACCIONES_CON_CORREO_INTENTADO.has(accion) && nombre === 'correo';
}

/** Nombre que se puede mostrar en el log técnico (nunca un valor). */
function nombreParaAviso(nombre: string): string {
  return PATRON_NOMBRE_CAMPO.test(nombre)
    ? nombre.slice(0, LONGITUD_MAXIMA_NOMBRE_CAMPO)
    : '(nombre no válido)';
}

/**
 * Devuelve un detalle seguro de guardar: solo valores simples (texto, número
 * finito, booleano o `null`), sin campos ni valores prohibidos, con textos
 * recortados y como máximo `CAMPOS_MAXIMOS` campos.
 */
export function sanearDetalle(
  accion: AccionAuditoria,
  detalle: Readonly<Record<string, unknown>> | undefined,
): DetalleSaneado {
  const aceptados: [string, ValorDetalle][] = [];
  const descartados: string[] = [];

  for (const [nombre, valor] of Object.entries(detalle ?? {})) {
    if (esCorreoIntentado(accion, nombre)) {
      if (typeof valor === 'string') {
        aceptados.push([nombre, normalizarCorreoIntentado(valor)]);
      } else {
        descartados.push(nombre);
      }
      continue;
    }
    if (
      nombreProhibido(nombre) ||
      !esValorDetalle(valor) ||
      valorProhibido(valor)
    ) {
      descartados.push(nombreParaAviso(nombre));
      continue;
    }
    aceptados.push([
      nombre,
      typeof valor === 'string' ? valor.slice(0, LONGITUD_MAXIMA_TEXTO) : valor,
    ]);
  }

  const sobrantes = aceptados.splice(CAMPOS_MAXIMOS);
  descartados.push(...sobrantes.map(([nombre]) => nombre));

  return {
    detalle: Object.freeze(Object.fromEntries(aceptados)),
    descartados,
  };
}
