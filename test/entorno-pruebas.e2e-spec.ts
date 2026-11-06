import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  asegurarBasePruebas,
  variablesEntornoPruebas,
} from './preparacion/entorno-pruebas.js';

describe('D-23: las pruebas e2e solo usan la base _pruebas', () => {
  it.each([
    'catalogostock',
    'catalogostock_produccion',
    'pruebas',
    '',
    undefined,
  ])('aborta con la base "%s"', (nombre) => {
    expect(() => asegurarBasePruebas(nombre)).toThrow('PELIGRO');
  });

  it('acepta una base que termina en _pruebas', () => {
    expect(asegurarBasePruebas('catalogostock_pruebas')).toBe(
      'catalogostock_pruebas',
    );
  });

  it('la conexión sale de .env.pruebas, nunca de las variables BD_* del entorno', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'cs-pruebas-'));
    const anterior = process.env.BD_NOMBRE;
    try {
      process.env.BD_NOMBRE = 'catalogostock';
      expect(variablesEntornoPruebas(carpeta).BD_NOMBRE).toBe(
        'base_sin_configurar_pruebas',
      );

      writeFileSync(
        join(carpeta, '.env.pruebas'),
        'BD_NOMBRE=otra_pruebas\nJWT_SECRETO=no-se-lee\n',
      );
      const variables = variablesEntornoPruebas(carpeta);
      expect(variables.BD_NOMBRE).toBe('otra_pruebas');
      expect(variables.JWT_SECRETO).not.toBe('no-se-lee');
    } finally {
      process.env.BD_NOMBRE = anterior;
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('esta ejecución está conectada a una base _pruebas', () => {
    expect(process.env.BD_NOMBRE).toMatch(/_pruebas$/);
  });
});
