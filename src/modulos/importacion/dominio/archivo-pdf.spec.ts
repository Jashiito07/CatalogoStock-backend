import {
  MAXIMO_PAGINAS_PDF,
  parecePdfCifrado,
  sanearNombreArchivo,
  TAMANIO_MAXIMO_PDF_BYTES,
  tieneFirmaPdf,
  validarArchivoPdf,
} from './archivo-pdf.js';

const pdfMinimo = (extra = ''): Buffer =>
  Buffer.from(`%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< ${extra} >>\n%%EOF`);

describe('D-46 / D-55: validación del PDF subido', () => {
  it('los límites del contrato: 60 MB, 400 páginas', () => {
    expect(TAMANIO_MAXIMO_PDF_BYTES).toBe(60 * 1024 * 1024);
    expect(MAXIMO_PAGINAS_PDF).toBe(400);
  });

  it('la firma «%PDF-» manda, no la extensión: un texto que dice .pdf es 415 FORMATO_NO_PERMITIDO', () => {
    expect(tieneFirmaPdf(pdfMinimo())).toBe(true);
    expect(() =>
      validarArchivoPdf(Buffer.from('esto es solo texto, no un PDF')),
    ).toThrowError(expect.objectContaining({ codigo: 'FORMATO_NO_PERMITIDO' }));
    expect(() => validarArchivoPdf(Buffer.alloc(0))).toThrowError(
      expect.objectContaining({ codigo: 'FORMATO_NO_PERMITIDO' }),
    );
    // Otro formato con extensión .pdf (un JPG).
    expect(() =>
      validarArchivoPdf(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])),
    ).toThrowError(expect.objectContaining({ codigo: 'FORMATO_NO_PERMITIDO' }));
  });

  it('más de 60 MB es 413 ARCHIVO_DEMASIADO_GRANDE; exactamente 60 MB se acepta', () => {
    const exacto = Buffer.alloc(TAMANIO_MAXIMO_PDF_BYTES, 0x20);
    Buffer.from('%PDF-1.4').copy(exacto);
    expect(() => validarArchivoPdf(exacto)).not.toThrow();

    const grande = Buffer.alloc(TAMANIO_MAXIMO_PDF_BYTES + 1, 0x20);
    Buffer.from('%PDF-1.4').copy(grande);
    expect(() => validarArchivoPdf(grande)).toThrowError(
      expect.objectContaining({ codigo: 'ARCHIVO_DEMASIADO_GRANDE' }),
    );
  });

  it('un PDF cifrado (con /Encrypt en el tráiler) es 422 PDF_ILEGIBLE', () => {
    expect(parecePdfCifrado(pdfMinimo())).toBe(false);
    expect(parecePdfCifrado(pdfMinimo('/Encrypt 5 0 R'))).toBe(true);
    expect(() => validarArchivoPdf(pdfMinimo('/Encrypt 5 0 R'))).toThrowError(
      expect.objectContaining({ codigo: 'PDF_ILEGIBLE' }),
    );
  });
});

describe('D-20: el nombre del archivo es solo informativo y se sanea', () => {
  it.each([
    ['catalogo.pdf', 'catalogo.pdf'],
    ['C:\\Users\\ana\\Escritorio\\Catálogo Yanbal.pdf', 'Catálogo Yanbal.pdf'],
    ['/home/ana/../../etc/pasaporte.pdf', 'pasaporte.pdf'],
    ['..\\..\\secreto.pdf', 'secreto.pdf'],
    ['a<b>c|d?.pdf', 'a_b_c_d_.pdf'],
    ['.oculto.pdf', 'oculto.pdf'],
  ])('«%s» → «%s»', (entrada, esperado) => {
    expect(sanearNombreArchivo(entrada)).toBe(esperado);
  });

  it('corrige el UTF-8 que Multer entrega como latin1', () => {
    const comoLlega = Buffer.from('Ñandú.pdf', 'utf8').toString('latin1');
    expect(sanearNombreArchivo(comoLlega)).toBe('Ñandú.pdf');
  });

  it('vacío, sin texto útil o ausente → nombre por defecto; más de 120 caracteres se recorta conservando la extensión', () => {
    expect(sanearNombreArchivo('')).toBe('catalogo.pdf');
    expect(sanearNombreArchivo(undefined)).toBe('catalogo.pdf');
    expect(sanearNombreArchivo('???')).toBe('catalogo.pdf');
    const largo = sanearNombreArchivo(`${'a'.repeat(300)}.pdf`);
    expect([...largo]).toHaveLength(120);
    expect(largo.endsWith('.pdf')).toBe(true);
  });
});
