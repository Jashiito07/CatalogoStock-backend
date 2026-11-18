import { Dinero } from '../../../compartido/dominio/dinero.js';
import { claveDeEmparejamiento } from '../../productos/validaciones.js';
import { cumpleAccion, esAccionRevision } from './accion-revision.js';
import { conEmparejamiento, requiereRevision } from './advertencias.js';
import { Borrador, type ProductoExistente } from './borrador.js';
import type { BorradorExtraido } from './borrador-extraido.js';

const AHORA = new Date('2026-11-18T15:00:00.000Z');
const MARCA = '00000000-0000-4000-8000-0000000000b1';

function crear(cambios: Partial<BorradorExtraido> = {}): Borrador {
  return Borrador.desdeExtraccion({
    id: '00000000-0000-4000-8000-000000000001',
    idImportacion: '00000000-0000-4000-8000-0000000000a1',
    marcaId: MARCA,
    extraido: {
      pagina: 1,
      posicion: 0,
      codigo: null,
      nombre: 'Jabón Líquido Avena',
      descripcion: null,
      precio: '5.50',
      precioNormal: null,
      advertencias: [],
      ...cambios,
    },
    ahora: AHORA,
  });
}

const existente = (
  precio: string,
  emparejadoPor: 'CODIGO' | 'NOMBRE',
): ProductoExistente => ({
  id: '00000000-0000-4000-8000-0000000000c1',
  nombre: 'Jabón líquido de avena',
  precio: Dinero.desdeTexto(precio),
  emparejadoPor,
});

describe('D-57: clave de emparejamiento por nombre', () => {
  it.each([
    ['Jabón Líquido Avena', 'jabon liquido avena'],
    ['  JABON   liquido  AVENA ', 'jabon liquido avena'],
    ['Crema Ésika, 50 g.', 'crema esika 50 g'],
    ['Crema (Ésika) - 50g!', 'crema esika 50g'],
    ['Eau de Parfum «Ñandú»', 'eau de parfum nandu'],
    ['¡¡¡???', ''],
  ])('«%s» → «%s»', (nombre, clave) => {
    expect(claveDeEmparejamiento(nombre)).toBe(clave);
  });

  it('nombres distintos no coinciden: distinguir «Crema» de «Crema Mani»', () => {
    expect(claveDeEmparejamiento('Crema')).not.toBe(claveDeEmparejamiento('Crema Mani'));
  });
});

describe('D-57: emparejado por nombre de un borrador sin código', () => {
  it('puede emparejarse por nombre solo sin código, sin NOMBRE_DUDOSO y con letras o dígitos', () => {
    expect(crear().puedeEmparejarPorNombre).toBe(true);
    expect(crear({ codigo: '43873' }).puedeEmparejarPorNombre).toBe(false);
    // Muy corto: NOMBRE_DUDOSO.
    expect(crear({ nombre: 'Ab' }).puedeEmparejarPorNombre).toBe(false);
    // Solo números: NOMBRE_DUDOSO.
    expect(crear({ nombre: '12345' }).puedeEmparejarPorNombre).toBe(false);
    expect(crear({ advertencias: ['NOMBRE_DUDOSO'] }).puedeEmparejarPorNombre).toBe(false);
  });

  it('con un único producto: productoExistente, EMPAREJADO_POR_NOMBRE (informativa) y sin YA_IMPORTADO', () => {
    const publico = crear().aPublico(existente('5.00', 'NOMBRE'));

    expect(publico.productoExistente?.emparejadoPor).toBe('NOMBRE');
    expect(publico.advertencias).toContain('EMPAREJADO_POR_NOMBRE');
    expect(publico.advertencias).not.toContain('YA_IMPORTADO');
    expect(publico.advertencias).not.toContain('EMPAREJAMIENTO_AMBIGUO');
    expect(requiereRevision(['EMPAREJADO_POR_NOMBRE'])).toBe(false);
  });

  it('ambiguo (varios productos): sin productoExistente y con EMPAREJAMIENTO_AMBIGUO', () => {
    const publico = crear().aPublico(null, true);

    expect(publico.productoExistente).toBeNull();
    expect(publico.advertencias).toContain('EMPAREJAMIENTO_AMBIGUO');
    expect(publico.advertencias).not.toContain('EMPAREJADO_POR_NOMBRE');
    expect(requiereRevision(['EMPAREJAMIENTO_AMBIGUO'])).toBe(false);
  });

  it('con código: emparejadoPor CODIGO y YA_IMPORTADO; un aprobado no muestra ni advertencias de emparejamiento', () => {
    const conCodigo = crear({ codigo: '43873' });
    expect(conCodigo.aPublico(existente('5.00', 'CODIGO')).advertencias).toContain('YA_IMPORTADO');
    const aprobado = conCodigo.aprobar('00000000-0000-4000-8000-0000000000c1', AHORA);
    expect(aprobado.aPublico(existente('5.00', 'CODIGO'), true).advertencias).toEqual(
      expect.not.arrayContaining(['YA_IMPORTADO', 'EMPAREJAMIENTO_AMBIGUO']),
    );
  });

  it('conEmparejamiento conserva el orden del contrato y descarta lo guardado', () => {
    expect(
      conEmparejamiento(['YA_IMPORTADO', 'PRECIO_EN_OFERTA', 'EMPAREJADO_POR_NOMBRE'], 'NOMBRE', true),
    ).toEqual(['PRECIO_EN_OFERTA', 'EMPAREJADO_POR_NOMBRE', 'EMPAREJAMIENTO_AMBIGUO']);
    expect(conEmparejamiento(['SIN_PRECIO'], null, false)).toEqual(['SIN_PRECIO']);
  });
});

describe('D-57: filtro accion', () => {
  it('solo ACTUALIZAR, NUEVO y CAMBIO_PRECIO son válidos', () => {
    for (const valor of ['ACTUALIZAR', 'NUEVO', 'CAMBIO_PRECIO']) {
      expect(esAccionRevision(valor)).toBe(true);
    }
    for (const valor of ['actualizar', 'OTRA', '', null, 1]) {
      expect(esAccionRevision(valor)).toBe(false);
    }
  });

  it('ACTUALIZAR = con producto; NUEVO = sin producto; CAMBIO_PRECIO excluye el mismo precio', () => {
    const borrador = crear(); // 5.50
    const igual = existente('5.50', 'NOMBRE');
    const distinto = existente('5.00', 'NOMBRE');

    expect(cumpleAccion('ACTUALIZAR', borrador, distinto)).toBe(true);
    expect(cumpleAccion('ACTUALIZAR', borrador, igual)).toBe(true);
    expect(cumpleAccion('ACTUALIZAR', borrador, null)).toBe(false);
    expect(cumpleAccion('NUEVO', borrador, null)).toBe(true);
    expect(cumpleAccion('NUEVO', borrador, distinto)).toBe(false);
    expect(cumpleAccion('CAMBIO_PRECIO', borrador, distinto)).toBe(true);
    expect(cumpleAccion('CAMBIO_PRECIO', borrador, igual)).toBe(false);
    expect(cumpleAccion('CAMBIO_PRECIO', borrador, null)).toBe(false);
  });

  it('un borrador sin precio no es CAMBIO_PRECIO; uno aprobado o descartado no cumple ninguna', () => {
    const sinPrecio = crear({ precio: null });
    expect(cumpleAccion('CAMBIO_PRECIO', sinPrecio, existente('5.00', 'NOMBRE'))).toBe(false);
    for (const cerrado of [
      crear().aprobar('00000000-0000-4000-8000-0000000000c1', AHORA),
      crear().descartar(AHORA),
    ]) {
      for (const accion of ['ACTUALIZAR', 'NUEVO', 'CAMBIO_PRECIO'] as const) {
        expect(cumpleAccion(accion, cerrado, null)).toBe(false);
      }
    }
  });
});
