import { VIGENCIA_CODIGO_MINUTOS } from './codigo-recuperacion.js';

/**
 * Plantilla del correo con el código (contrato de correo, «Contenido del
 * correo»). TypeScript puro. Texto sencillo en español y HTML mínimo, sin
 * enlaces, imágenes remotas ni formularios: no pide datos ni rastrea.
 *
 * Solo contiene el código y la vigencia. Nunca el nombre, el teléfono ni
 * ningún otro dato de la cuenta.
 */

export const ASUNTO_CORREO_CODIGO = 'Tu código de CatálogoStock';

export type FinalidadCodigoCorreo = 'RECUPERACION' | 'VERIFICACION';

export interface CorreoCodigo {
  asunto: string;
  texto: string;
  html: string;
}

const PATRON_CODIGO = /^\d{6}$/;

const INTRODUCCION: Readonly<Record<FinalidadCodigoCorreo, string>> = {
  RECUPERACION:
    'Recibimos una solicitud para restablecer tu clave de CatálogoStock.',
  VERIFICACION:
    'Para verificar tu correo en CatálogoStock, escribe este código en la aplicación.',
};

const SI_NO_LO_PEDISTE: Readonly<Record<FinalidadCodigoCorreo, string>> = {
  RECUPERACION:
    'Si no lo pediste, ignora este mensaje: tu clave no cambiará. Si te preocupa tu cuenta, avisa al vendedor.',
  VERIFICACION:
    'Si no lo pediste, ignora este mensaje: no se hará ningún cambio en tu cuenta.',
};

/** Escapa los caracteres con significado en HTML (defensa en profundidad: el código solo trae dígitos). */
function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Arma el correo del código de 6 dígitos; falla si no tiene ese formato. */
export function crearCorreoCodigo(
  finalidad: FinalidadCodigoCorreo,
  codigo: string,
): CorreoCodigo {
  if (!PATRON_CODIGO.test(codigo)) {
    throw new Error('El código del correo debe tener 6 dígitos.');
  }
  const vigencia = `Vence en ${VIGENCIA_CODIGO_MINUTOS} minutos y sirve una sola vez.`;
  const advertencia = 'No lo compartas con nadie.';
  const introduccion = INTRODUCCION[finalidad];
  const siNoLoPediste = SI_NO_LO_PEDISTE[finalidad];

  const texto = [
    introduccion,
    '',
    `Tu código es: ${codigo}`,
    '',
    vigencia,
    advertencia,
    '',
    siNoLoPediste,
    '',
    'CatálogoStock',
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#1E293B;">',
    '<h2 style="margin:0 0 12px;">CatálogoStock</h2>',
    `<p>${escaparHtml(introduccion)}</p>`,
    `<p style="font-size:28px;letter-spacing:6px;font-weight:bold;margin:16px 0;">${escaparHtml(codigo)}</p>`,
    `<p>${escaparHtml(vigencia)} <strong>${escaparHtml(advertencia)}</strong></p>`,
    `<p>${escaparHtml(siNoLoPediste)}</p>`,
    '</body></html>',
  ].join('');

  return { asunto: ASUNTO_CORREO_CODIGO, texto, html };
}
