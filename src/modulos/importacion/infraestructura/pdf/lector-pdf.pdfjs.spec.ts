import { leerCatalogo } from '../../dominio/lector-catalogo.js';
import { LectorPdfPdfjs } from './lector-pdf.pdfjs.js';
import {
  crearPdfDanadoSintetico,
  crearPdfLeonisaSintetico,
  crearPdfSinTextoSintetico,
  crearPdfSintetico,
  crearPdfYanbalSintetico,
} from './pdf-sintetico.prueba-spec.js';

describe('RF-PRO-01: lector de PDF con pdfjs (PDF sintéticos)', () => {
  const lector = new LectorPdfPdfjs();

  it('extrae el texto con posición, de arriba hacia abajo, con sus tildes', async () => {
    const paginas = await lector.leer(crearPdfYanbalSintetico());

    expect(paginas).toHaveLength(1);
    expect(paginas[0]).toMatchObject({ numero: 1, ancho: 510, alto: 708 });
    const textos = paginas[0].bloques.map((b) => b.texto);
    expect(textos.slice(0, 5)).toEqual([
      'Crema Hidratante Mani',
      'OFERTA US$ 35.00',
      'P. Normal US$ 44.00',
      'CÓD. 43873',
      'Pág. 12',
    ]);
    const crema = paginas[0].bloques[0];
    expect(crema.x0).toBeCloseTo(50, 0);
    expect(crema.y1).toBeCloseTo(100, 0);
  });

  it('RF-PRO-01: el PDF sintético de Yanbal con 3 productos produce 3 borradores con las advertencias correctas', async () => {
    const lectura = leerCatalogo(await lector.leer(crearPdfYanbalSintetico()));

    expect(lectura.perfil).toBe('YANBAL');
    expect(
      lectura.borradores.map((b) => ({
        codigo: b.codigo,
        nombre: b.nombre,
        precio: b.precio,
        precioNormal: b.precioNormal,
        advertencias: b.advertencias,
      })),
    ).toEqual([
      {
        codigo: '43873',
        nombre: 'Crema Hidratante Mani',
        precio: '35.00',
        precioNormal: '44.00',
        advertencias: ['PRECIO_EN_OFERTA'],
      },
      {
        codigo: '5054',
        nombre: 'Esmalte Color Rosa',
        precio: null,
        precioNormal: null,
        advertencias: ['SIN_PRECIO'],
      },
      {
        codigo: null,
        nombre: 'Jabón Líquido Avena',
        precio: '5.50',
        precioNormal: null,
        advertencias: ['SIN_CODIGO'],
      },
    ]);
  });

  it('RF-PRO-01: el PDF sintético de Leonisa se lee con su perfil (precio, referencia y descripción)', async () => {
    const lectura = leerCatalogo(await lector.leer(crearPdfLeonisaSintetico()));

    expect(lectura.perfil).toBe('LEONISA');
    expect(lectura.borradores).toHaveLength(2);
    expect(lectura.borradores[0]).toMatchObject({
      codigo: '091183',
      nombre: 'Magic Corset',
      precio: '48.99',
      advertencias: ['VARIAS_REFERENCIAS'],
    });
    expect(lectura.borradores[0].descripcion).toBe(
      'Con arco. Varillas laterales. Multiusos: cruzado. ' +
        'Ref. 091183 / Copa B (tallas 32, 34; Blanco). ' +
        'Ref. 091183C / Copa C (tallas 36; Negro).',
    );
    expect(lectura.borradores[1]).toMatchObject({
      codigo: '72323',
      nombre: 'Panty clásico',
      precio: '12.99',
      precioNormal: '15.99',
      advertencias: ['PRECIO_EN_OFERTA'],
    });
  });

  it('D-46: un PDF dañado, o sin texto, es PDF_ILEGIBLE', async () => {
    await expect(lector.leer(crearPdfDanadoSintetico())).rejects.toMatchObject({
      codigo: 'PDF_ILEGIBLE',
    });
    await expect(lector.leer(crearPdfSinTextoSintetico())).rejects.toMatchObject({
      codigo: 'PDF_ILEGIBLE',
    });
  });

  it('el máximo de páginas se respeta: más de lo permitido es ARCHIVO_DEMASIADO_GRANDE', async () => {
    const pdf = crearPdfSintetico([
      [{ texto: 'uno', x: 10, y: 10 }],
      [{ texto: 'dos', x: 10, y: 10 }],
      [{ texto: 'tres', x: 10, y: 10 }],
    ]);

    await expect(
      new LectorPdfPdfjs({ maximoPaginas: 2 }).leer(pdf),
    ).rejects.toMatchObject({ codigo: 'ARCHIVO_DEMASIADO_GRANDE' });
    await expect(
      new LectorPdfPdfjs({ maximoPaginas: 3 }).leer(pdf),
    ).resolves.toHaveLength(3);
  });

  it('el tiempo máximo de análisis se respeta: sin tiempo, PDF_ILEGIBLE', async () => {
    const pdf = crearPdfSintetico([[{ texto: 'uno', x: 10, y: 10 }]]);

    await expect(
      new LectorPdfPdfjs({ tiempoMaximoMs: 0 }).leer(pdf),
    ).rejects.toMatchObject({ codigo: 'PDF_ILEGIBLE' });
  });

  it('no modifica el archivo recibido', async () => {
    const pdf = crearPdfYanbalSintetico();
    const copia = Buffer.from(pdf);

    await lector.leer(pdf);

    expect(pdf.equals(copia)).toBe(true);
  });
});
