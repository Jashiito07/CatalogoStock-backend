import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import { crearRol, esRol, ROLES } from './rol.js';

describe('RF-USU-02: roles Vendedor y Cliente', () => {
  it('existen exactamente los roles CLIENTE y VENDEDOR', () => {
    expect([...ROLES]).toEqual(['CLIENTE', 'VENDEDOR']);
  });

  it.each(['CLIENTE', 'VENDEDOR'])('acepta el rol %s', (valor) => {
    expect(esRol(valor)).toBe(true);
    expect(crearRol(valor)).toBe(valor);
  });

  it.each([
    'cliente',
    'Vendedor',
    'ADMIN',
    'ADMINISTRADOR',
    '',
    ' CLIENTE',
    undefined,
    null,
    1,
  ])('rechaza el valor %s', (valor) => {
    expect(esRol(valor)).toBe(false);
    expect(() => crearRol(valor)).toThrow(DatosInvalidosError);
  });
});
