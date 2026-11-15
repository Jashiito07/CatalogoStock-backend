import {
  ASUNTO_CORREO_CODIGO,
  crearCorreoCodigo,
} from './plantilla-correo-codigo.js';

describe('Contrato de correo: plantilla del código', () => {
  it.each(['RECUPERACION', 'VERIFICACION'] as const)(
    '%s: asunto del contrato, código, vigencia de 15 minutos, aviso de no compartir y qué hacer si no lo pidió',
    (finalidad) => {
      const correo = crearCorreoCodigo(finalidad, '482913');

      expect(correo.asunto).toBe('Tu código de CatálogoStock');
      expect(ASUNTO_CORREO_CODIGO).toBe(correo.asunto);
      for (const cuerpo of [correo.texto, correo.html]) {
        expect(cuerpo).toContain('482913');
        expect(cuerpo).toContain('15 minutos');
        expect(cuerpo).toContain('No lo compartas con nadie');
        expect(cuerpo).toContain('Si no lo pediste');
      }
    },
  );

  it('sin enlaces, formularios ni imágenes remotas; HTML mínimo', () => {
    const { html, texto } = crearCorreoCodigo('RECUPERACION', '000123');

    expect(html).not.toMatch(/<a |href=|<img|<form|<script|https?:\/\//i);
    expect(texto).not.toMatch(/https?:\/\//i);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('solo trae el código: ni correos ni teléfonos ni claves', () => {
    const { html, texto } = crearCorreoCodigo('VERIFICACION', '999999');

    expect(`${texto}${html}`).not.toMatch(/@|\+593|clave:|contraseña/i);
  });

  it.each(['12345', '1234567', '12a456', '<b>1234', ''])(
    'rechaza el código «%s» que no tiene 6 dígitos',
    (codigo) => {
      expect(() => crearCorreoCodigo('RECUPERACION', codigo)).toThrow(
        '6 dígitos',
      );
    },
  );
});
