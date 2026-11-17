import { Dinero } from '../../../compartido/dominio/dinero.js';
import { calcularAdvertencias, esNombreDudoso, requiereRevision } from './advertencias.js';
import { Borrador } from './borrador.js';
import type { BorradorExtraido } from './borrador-extraido.js';

const AHORA = new Date('2026-11-16T15:00:00.000Z');
const MARCA = '00000000-0000-4000-8000-0000000000b1';
const OTRA_MARCA = '00000000-0000-4000-8000-0000000000b2';

function extraido(cambios: Partial<BorradorExtraido> = {}): BorradorExtraido {
  return {
    pagina: 7,
    posicion: 0,
    codigo: '43873',
    nombre: 'Crema Hidratante Mani',
    descripcion: null,
    precio: '35.00',
    precioNormal: '44.00',
    advertencias: [],
    ...cambios,
  };
}

function crear(
  cambios: Partial<BorradorExtraido> = {},
  yaImportados: string[] = [],
): Borrador {
  return Borrador.desdeExtraccion({
    id: '00000000-0000-4000-8000-000000000001',
    idImportacion: '00000000-0000-4000-8000-0000000000a1',
    marcaId: MARCA,
    extraido: extraido(cambios),
    codigosYaImportados: new Set(yaImportados),
    ahora: AHORA,
  });
}

describe('RF-PRO-01: advertencias de un borrador', () => {
  it('SIN_PRECIO, SIN_CODIGO, NOMBRE_DUDOSO y PRECIO_EN_OFERTA salen de los campos, en el orden del contrato', () => {
    expect(
      calcularAdvertencias({
        codigo: null,
        nombre: 'x',
        precio: null,
        precioNormal: null,
      }),
    ).toEqual(['SIN_PRECIO', 'SIN_CODIGO', 'NOMBRE_DUDOSO']);
    expect(
      calcularAdvertencias({
        codigo: '1',
        nombre: 'Crema Mani',
        precio: Dinero.desdeTexto('35'),
        precioNormal: Dinero.desdeTexto('44'),
      }),
    ).toEqual(['PRECIO_EN_OFERTA']);
    // Con el mismo precio normal y vigente no hay oferta.
    expect(
      calcularAdvertencias({
        codigo: '1',
        nombre: 'Crema Mani',
        precio: Dinero.desdeTexto('35'),
        precioNormal: Dinero.desdeTexto('35.00'),
      }),
    ).toEqual([]);
  });

  it.each([
    ['A', true],
    ['12345', true],
    ['Sin nombre (CÓD. 12)', true],
    ['x'.repeat(81), true],
    ['Crema', false],
    ['Crema Hidratante Mani', false],
  ])('NOMBRE_DUDOSO (muy corto, solo números, sin nombre o muy largo): «%s» → %s', (nombre, dudoso) => {
    expect(esNombreDudoso(nombre)).toBe(dudoso);
  });

  it('las informativas (PRECIO_EN_OFERTA, VARIAS_REFERENCIAS) no cuentan como «con advertencias»', () => {
    expect(requiereRevision(['PRECIO_EN_OFERTA', 'VARIAS_REFERENCIAS'])).toBe(false);
    expect(requiereRevision(['PRECIO_EN_OFERTA', 'SIN_PRECIO'])).toBe(true);
    expect(requiereRevision(['YA_IMPORTADO'])).toBe(true);
    expect(requiereRevision([])).toBe(false);
  });
});

describe('RF-PRO-01: borrador', () => {
  it('nace PENDIENTE, DISPONIBLE y con la marca de la importación; YA_IMPORTADO si el código ya fue aprobado', () => {
    const borrador = crear({}, ['43873']);

    expect(borrador.estado).toBe('PENDIENTE');
    expect(borrador.disponibilidad).toBe('DISPONIBLE');
    expect(borrador.marcaId).toBe(MARCA);
    expect(borrador.idProducto).toBeNull();
    expect(borrador.advertencias).toEqual(['PRECIO_EN_OFERTA', 'YA_IMPORTADO']);
  });

  it('conserva CODIGO_REPETIDO, VARIAS_REFERENCIAS y un NOMBRE_DUDOSO fijado al leer', () => {
    const borrador = crear({
      advertencias: ['CODIGO_REPETIDO', 'VARIAS_REFERENCIAS', 'NOMBRE_DUDOSO'],
    });
    expect(borrador.advertencias).toEqual([
      'NOMBRE_DUDOSO',
      'PRECIO_EN_OFERTA',
      'CODIGO_REPETIDO',
      'VARIAS_REFERENCIAS',
    ]);
  });

  describe('RN-11: editar con las validaciones de POST /productos', () => {
    it('precio con 3 decimales → 400 DATOS_INVALIDOS; número en lugar de texto → 400', () => {
      const borrador = crear();
      expect(() => borrador.editar({ precio: '12.505' }, AHORA)).toThrowError(
        expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
      );
      expect(() => borrador.editar({ precio: 12.5 }, AHORA)).toThrowError(
        expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
      );
      expect(() => borrador.editar({ precio: '0' }, AHORA)).toThrowError(
        expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
      );
      expect(() => borrador.editar({ nombre: 'x' }, AHORA)).toThrowError(
        expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }),
      );
      expect(() =>
        borrador.editar({ disponibilidad: 'EN_CAMINO' }, AHORA),
      ).toThrowError(expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }));
    });

    it('escribir el precio quita SIN_PRECIO; cambiar el nombre quita NOMBRE_DUDOSO; solo cambia lo que cambió', () => {
      const sinPrecio = crear({
        precio: null,
        precioNormal: null,
        nombre: 'Sin nombre (CÓD. 43873)',
      });
      expect(sinPrecio.sinPrecio).toBe(true);
      expect(sinPrecio.advertencias).toEqual(['SIN_PRECIO', 'NOMBRE_DUDOSO']);

      const { borrador, campos } = sinPrecio.editar(
        { precio: '12.5', nombre: 'Crema de manos', marcaId: OTRA_MARCA },
        AHORA,
      );

      expect(campos).toEqual(['nombre', 'precio', 'marcaId']);
      expect(borrador.precio?.aTexto()).toBe('12.50');
      expect(borrador.marcaId).toBe(OTRA_MARCA);
      expect(borrador.advertencias).toEqual([]);
    });

    it('un cambio que no cambia nada devuelve el mismo borrador; una descripción vacía queda en null', () => {
      const borrador = crear({ descripcion: 'Cont. 50 ml' });
      expect(borrador.editar({ precio: '35' }, AHORA).borrador).toBe(borrador);
      expect(
        borrador.editar({ descripcion: '   ' }, AHORA).borrador.descripcion,
      ).toBeNull();
    });

    it('un NOMBRE_DUDOSO fijado al leer sobrevive a editar otro campo', () => {
      const borrador = crear({ advertencias: ['NOMBRE_DUDOSO'] });
      expect(
        borrador.editar({ precio: '30' }, AHORA).borrador.advertencias,
      ).toContain('NOMBRE_DUDOSO');
    });

    it('solo un borrador PENDIENTE es editable: 422 BORRADOR_NO_EDITABLE', () => {
      const aprobado = crear().aprobar('00000000-0000-4000-8000-0000000000c1', AHORA);
      const descartado = crear().descartar(AHORA);
      for (const borrador of [aprobado, descartado]) {
        expect(() => borrador.editar({ precio: '30' }, AHORA)).toThrowError(
          expect.objectContaining({ codigo: 'BORRADOR_NO_EDITABLE' }),
        );
      }
    });
  });

  describe('al aprobar: la descripción termina con «Cód. <código>»', () => {
    it.each([
      [null, '43873', 'Cód. 43873'],
      ['Cont. 50 ml', '43873', 'Cont. 50 ml Cód. 43873'],
      ['Cont. 50 ml', null, 'Cont. 50 ml'],
      ['Ya dice Cód. 43873', '43873', 'Ya dice Cód. 43873'],
      [null, '011715C', 'Cód. 011715C'],
    ])('descripción %j, código %j → «%s»', (descripcion, codigo, esperado) => {
      expect(crear({ descripcion, codigo }).descripcionParaProducto()).toBe(esperado);
    });

    it('con la descripción en el límite de 2000 caracteres, recorta la descripción y conserva el código', () => {
      const resultado = crear({ descripcion: 'a'.repeat(2000) }).descripcionParaProducto();
      expect([...resultado]).toHaveLength(2000);
      expect(resultado.endsWith(' Cód. 43873')).toBe(true);
    });
  });

  it('aprobar y descartar devuelven un borrador nuevo con su estado; el original no cambia', () => {
    const borrador = crear();
    const aprobado = borrador.aprobar('00000000-0000-4000-8000-0000000000c1', AHORA);
    expect(aprobado.estado).toBe('APROBADO');
    expect(aprobado.idProducto).toBe('00000000-0000-4000-8000-0000000000c1');
    expect(borrador.estado).toBe('PENDIENTE');
    expect(borrador.descartar(AHORA).estado).toBe('DESCARTADO');
  });
});
