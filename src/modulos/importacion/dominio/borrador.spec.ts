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

function crear(cambios: Partial<BorradorExtraido> = {}): Borrador {
  return Borrador.desdeExtraccion({
    id: '00000000-0000-4000-8000-000000000001',
    idImportacion: '00000000-0000-4000-8000-0000000000a1',
    marcaId: MARCA,
    extraido: extraido(cambios),
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
    // D-57: YA_IMPORTADO ahora es informativa (se actualizará el producto que ya existe).
    expect(requiereRevision(['YA_IMPORTADO'])).toBe(false);
    expect(requiereRevision([])).toBe(false);
  });
});

describe('RF-PRO-01: borrador', () => {
  it('nace PENDIENTE, DISPONIBLE y con la marca de la importación; YA_IMPORTADO no se guarda (D-57)', () => {
    const borrador = crear();

    expect(borrador.estado).toBe('PENDIENTE');
    expect(borrador.disponibilidad).toBe('DISPONIBLE');
    expect(borrador.marcaId).toBe(MARCA);
    expect(borrador.idProducto).toBeNull();
    expect(borrador.advertencias).toEqual(['PRECIO_EN_OFERTA']);
  });

  describe('D-57: producto existente y YA_IMPORTADO (informativa, se deduce al leer)', () => {
    const existente = {
      id: '00000000-0000-4000-8000-0000000000c1',
      nombre: 'Crema Hidratante Mani',
      precio: Dinero.desdeTexto('30.00'),
      emparejadoPor: 'CODIGO' as const,
    };

    it('un pendiente con producto existente lo muestra y agrega YA_IMPORTADO en el orden del contrato', () => {
      const publico = crear().aPublico(existente);

      expect(publico.productoExistente).toEqual(existente);
      expect(publico.advertencias).toEqual(['PRECIO_EN_OFERTA', 'YA_IMPORTADO']);
      expect(requiereRevision(publico.advertencias)).toBe(false);
    });

    it('sin producto existente no hay productoExistente ni YA_IMPORTADO, aunque uno viejo siguiera guardado', () => {
      const conViejo = Borrador.reconstituir({
        ...crear().aPublico(),
        pagina: 7,
        posicion: 0,
        advertencias: ['PRECIO_EN_OFERTA', 'YA_IMPORTADO'],
        creadoEn: AHORA,
        actualizadoEn: AHORA,
      });

      expect(conViejo.aPublico().productoExistente).toBeNull();
      expect(conViejo.aPublico().advertencias).toEqual(['PRECIO_EN_OFERTA']);
    });

    it('un borrador aprobado o descartado no muestra producto existente', () => {
      expect(
        crear().aprobar(existente.id, AHORA).aPublico(existente).productoExistente,
      ).toBeNull();
      expect(
        crear().descartar(AHORA).aPublico(existente).advertencias,
      ).not.toContain('YA_IMPORTADO');
    });

    it('editar el borrador no guarda YA_IMPORTADO', () => {
      const { borrador } = crear().editar({ precio: '30' }, AHORA);
      expect(borrador.advertencias).not.toContain('YA_IMPORTADO');
    });
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

  describe('D-57: al aprobar, la descripción del producto ya no lleva «Cód. <código>»', () => {
    it.each([
      [null, '43873', ''],
      ['Cont. 50 ml', '43873', 'Cont. 50 ml'],
      ['Cont. 50 ml', null, 'Cont. 50 ml'],
      [null, '011715C', ''],
    ])('descripción %j, código %j → «%s»', (descripcion, codigo, esperado) => {
      expect(crear({ descripcion, codigo }).descripcionParaProducto()).toBe(esperado);
    });

    it('con la descripción en el límite de 2000 caracteres la conserva completa', () => {
      const resultado = crear({ descripcion: 'a'.repeat(2000) }).descripcionParaProducto();
      expect([...resultado]).toHaveLength(2000);
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

describe('PRECIO_HEREDADO: el precio de la ficha exige confirmación del Vendedor', () => {
  it('requiere revisión (no es informativa) y se conserva al editar otros campos', () => {
    const borrador = crear({ advertencias: ['PRECIO_HEREDADO'] });

    expect(borrador.precioHeredado).toBe(true);
    expect(borrador.advertencias).toEqual(['PRECIO_HEREDADO', 'PRECIO_EN_OFERTA']);
    expect(requiereRevision(borrador.advertencias)).toBe(true);

    const { borrador: editado } = borrador.editar({ descripcion: 'Tono natural' }, AHORA);
    expect(editado.precioHeredado).toBe(true);
    const { borrador: renombrado } = borrador.editar({ nombre: 'Base Mate – Tono 1' }, AHORA);
    expect(renombrado.precioHeredado).toBe(true);
  });

  it('enviar el precio, aunque sea el mismo, lo confirma y quita la advertencia', () => {
    const borrador = crear({ advertencias: ['PRECIO_HEREDADO'] });

    const { borrador: mismo, campos } = borrador.editar({ precio: '35.00' }, AHORA);
    expect(campos).toEqual(['precio']);
    expect(mismo.precioHeredado).toBe(false);
    expect(mismo.advertencias).toEqual(['PRECIO_EN_OFERTA']);

    const { borrador: distinto } = borrador.editar({ precio: '30.00' }, AHORA);
    expect(distinto.precioHeredado).toBe(false);
    expect(distinto.precio?.aTexto()).toBe('30.00');
  });

  it('sin la advertencia, enviar el mismo precio no cambia nada', () => {
    const { campos } = crear().editar({ precio: '35.00' }, AHORA);
    expect(campos).toEqual([]);
  });

  it('PRECIO_HEREDADO sigue el orden del contrato (después de SIN_PRECIO)', () => {
    expect(
      calcularAdvertencias({
        codigo: null,
        nombre: 'Base',
        precio: Dinero.desdeTexto('10.00'),
        precioNormal: null,
        persistentes: ['PRECIO_HEREDADO'],
      }),
    ).toEqual(['PRECIO_HEREDADO', 'SIN_CODIGO']);
  });
});
