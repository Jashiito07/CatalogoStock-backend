import { esCanal, rolPermitidoEnCanal } from './canal.js';

describe('D-19: canal de ingreso y rol permitido', () => {
  it.each([
    ['CLIENTE', 'APP', true],
    ['VENDEDOR', 'PANEL', true],
    ['VENDEDOR', 'APP', false],
    ['CLIENTE', 'PANEL', false],
  ] as const)('%s en %s → %s', (rol, canal, permitido) => {
    expect(rolPermitidoEnCanal(rol, canal)).toBe(permitido);
  });

  it('solo existen los canales APP y PANEL', () => {
    expect(esCanal('APP')).toBe(true);
    expect(esCanal('PANEL')).toBe(true);
    expect(esCanal('WEB')).toBe(false);
    expect(esCanal(1)).toBe(false);
  });
});
