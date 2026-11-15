import {
  DemasiadasSolicitudesError,
  ServicioNoDisponibleError,
} from '../dominio/errores.js';
import { FiltroErrores } from './filtro-errores.js';

describe('Contrato de correo: errores 429 y 503 del filtro global', () => {
  const filtro = new FiltroErrores();

  it('DemasiadasSolicitudesError → 429 con su código y los segundos de espera', () => {
    const resultado = filtro.resolver(
      new DemasiadasSolicitudesError('DEMASIADAS_SOLICITUDES', 'Espere.', {
        reintentarEnSegundos: 90,
      }),
    );

    expect(resultado).toEqual({
      estado: 429,
      cuerpo: {
        codigo: 'DEMASIADAS_SOLICITUDES',
        mensaje: 'Espere.',
        detalles: { reintentarEnSegundos: 90 },
      },
    });
  });

  it('ServicioNoDisponibleError → 503 con el código y el mensaje del dominio, sin detalles técnicos', () => {
    const resultado = filtro.resolver(
      new ServicioNoDisponibleError('CORREO_NO_DISPONIBLE', 'No disponible.'),
    );

    expect(resultado).toEqual({
      estado: 503,
      cuerpo: {
        codigo: 'CORREO_NO_DISPONIBLE',
        mensaje: 'No disponible.',
        detalles: {},
      },
    });
  });
});
