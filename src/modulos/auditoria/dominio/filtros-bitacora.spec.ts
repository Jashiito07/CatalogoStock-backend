import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import {
  MENSAJE_RANGO_FECHAS,
  validarFiltrosBitacora,
} from './filtros-bitacora.js';

describe('RF-USU-04: filtros de la bitácora', () => {
  const desde = new Date('2026-11-05T05:00:00.000Z');

  it('acepta filtros vacíos, un solo extremo o hasta = desde (inclusive)', () => {
    expect(validarFiltrosBitacora({})).toEqual({});
    expect(validarFiltrosBitacora({ desde })).toEqual({ desde });
    expect(validarFiltrosBitacora({ hasta: desde })).toEqual({ hasta: desde });
    expect(validarFiltrosBitacora({ desde, hasta: desde })).toEqual({
      desde,
      hasta: desde,
    });
  });

  it('hasta < desde → DATOS_INVALIDOS en el campo «hasta»', () => {
    const hasta = new Date(desde.getTime() - 1);

    expect(() => validarFiltrosBitacora({ desde, hasta })).toThrow(
      DatosInvalidosError,
    );
    expect(() => validarFiltrosBitacora({ desde, hasta })).toThrow(
      expect.objectContaining({
        codigo: 'DATOS_INVALIDOS',
        detalles: {
          errores: [{ campo: 'hasta', errores: [MENSAJE_RANGO_FECHAS] }],
        },
      }),
    );
  });
});
