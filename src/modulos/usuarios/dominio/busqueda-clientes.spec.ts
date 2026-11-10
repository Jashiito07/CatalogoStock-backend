import {
  crearBusquedaClientes,
  LETRAS_CON_TILDE,
  LETRAS_SIN_TILDE,
  normalizarParaBusqueda,
} from './busqueda-clientes.js';

describe('RF-USU-05: búsqueda de clientes sin mayúsculas ni tildes', () => {
  it('la tabla de letras con y sin tilde tiene el mismo largo (la usa también SQL)', () => {
    expect([...LETRAS_CON_TILDE]).toHaveLength([...LETRAS_SIN_TILDE].length);
  });

  it('normaliza mayúsculas, tildes, ñ y ü', () => {
    expect(normalizarParaBusqueda('MARÍA Zambrano')).toBe('maria zambrano');
    expect(normalizarParaBusqueda('Peña Güiro')).toBe('pena guiro');
  });

  it('sin texto (o solo espacios) no filtra', () => {
    expect(crearBusquedaClientes(undefined)).toBeNull();
    expect(crearBusquedaClientes('   ')).toBeNull();
  });

  it('recorta espacios y prepara la variante E.164 de un celular nacional (D-14)', () => {
    expect(crearBusquedaClientes('  Zambrano ')).toEqual({
      texto: 'zambrano',
      telefonoInternacional: null,
    });
    expect(crearBusquedaClientes('0991234')).toEqual({
      texto: '0991234',
      telefonoInternacional: '+593991234',
    });
  });
});
