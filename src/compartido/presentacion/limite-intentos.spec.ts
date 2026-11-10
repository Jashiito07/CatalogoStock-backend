import type { ExecutionContext } from '@nestjs/common';
import {
  crearOpcionesLimiteIntentos,
  GRUPOS_LIMITE_INTENTOS,
  LimiteIntentos,
  respuestaDemasiadasSolicitudes,
} from './limite-intentos.js';

class RutasDePrueba {
  @LimiteIntentos('INGRESO')
  ingresoCliente(): void {}

  @LimiteIntentos('INGRESO')
  ingresoVendedor(): void {}

  @LimiteIntentos('REGISTRO')
  registro(): void {}

  sinLimite(): void {}
}

function contexto(metodo: keyof RutasDePrueba): ExecutionContext {
  return {
    getHandler: () => RutasDePrueba.prototype[metodo],
    getClass: () => RutasDePrueba,
  } as unknown as ExecutionContext;
}

describe('D-17: límite de intentos por IP', () => {
  const opciones = crearOpcionesLimiteIntentos();
  const limitadores = Array.isArray(opciones) ? opciones : opciones.throttlers;
  const limitador = (nombre: string) => {
    const encontrado = limitadores.find((l) => l.name === nombre);
    if (!encontrado) {
      throw new Error(`Falta el limitador ${nombre}`);
    }
    return encontrado;
  };

  it('ingreso 5, registro 3, renovación 10, recuperación 5 y cambio de clave 5 por minuto', () => {
    expect(GRUPOS_LIMITE_INTENTOS).toEqual({
      INGRESO: { limite: 5, ventanaMs: 60_000 },
      REGISTRO: { limite: 3, ventanaMs: 60_000 },
      RENOVACION: { limite: 10, ventanaMs: 60_000 },
      RECUPERACION: { limite: 5, ventanaMs: 60_000 },
      CAMBIO_CLAVE: { limite: 5, ventanaMs: 60_000 },
    });
    expect(limitador('INGRESO')).toMatchObject({ limit: 5, ttl: 60_000 });
    expect(limitador('RECUPERACION')).toMatchObject({ limit: 5, ttl: 60_000 });
    expect(limitador('CAMBIO_CLAVE')).toMatchObject({ limit: 5, ttl: 60_000 });
  });

  it('cada limitador solo cuenta las rutas de su grupo; las rutas sin grupo no tienen límite', () => {
    const ingreso = limitador('INGRESO');
    const registro = limitador('REGISTRO');

    expect(ingreso.skipIf?.(contexto('ingresoCliente'))).toBe(false);
    expect(ingreso.skipIf?.(contexto('registro'))).toBe(true);
    expect(registro.skipIf?.(contexto('registro'))).toBe(false);
    for (const l of limitadores) {
      expect(l.skipIf?.(contexto('sinLimite'))).toBe(true);
    }
  });

  it('las dos rutas de ingreso comparten el contador (misma clave por IP)', () => {
    const generar = limitador('INGRESO').generateKey;

    const cliente = generar?.(
      contexto('ingresoCliente'),
      '10.0.0.1',
      'INGRESO',
    );
    const vendedor = generar?.(
      contexto('ingresoVendedor'),
      '10.0.0.1',
      'INGRESO',
    );
    const otraIp = generar?.(contexto('ingresoCliente'), '10.0.0.2', 'INGRESO');

    expect(cliente).toBe(vendedor);
    expect(cliente).not.toBe(otraIp);
  });

  it('el cuerpo del 429 sigue el contrato', () => {
    expect(respuestaDemasiadasSolicitudes(42)).toEqual({
      codigo: 'DEMASIADAS_SOLICITUDES',
      mensaje: 'Demasiados intentos. Espere un momento e inténtelo de nuevo.',
      detalles: { reintentarEnSegundos: 42 },
    });
  });
});
