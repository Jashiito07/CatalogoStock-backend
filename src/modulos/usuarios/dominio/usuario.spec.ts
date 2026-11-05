import { inspect } from 'node:util';
import { ReglaNegocioError } from '../../../compartido/dominio/errores.js';
import { Correo } from './correo.js';
import { NombreUsuario } from './nombre-usuario.js';
import { Telefono } from './telefono.js';
import { Usuario, type PropiedadesUsuario } from './usuario.js';

const AHORA = new Date('2026-11-05T15:00:00.000Z');
const HASH_FICTICIO =
  '$2b$12$hashficticiodepruebahashficticiodepruebahashficticio';

const datosBase = {
  id: '6f1c0000-0000-4000-8000-000000000001',
  nombre: NombreUsuario.crear('María Zambrano'),
  correo: Correo.crear('Maria.Zambrano@Correo.com'),
  telefono: Telefono.crear('0991234567'),
  hashClave: HASH_FICTICIO,
  ahora: AHORA,
};

function propiedades(
  cambios: Partial<PropiedadesUsuario> = {},
): PropiedadesUsuario {
  return {
    id: datosBase.id,
    nombre: datosBase.nombre,
    correo: datosBase.correo,
    telefono: datosBase.telefono,
    hashClave: HASH_FICTICIO,
    rol: 'CLIENTE',
    activo: true,
    privacidadAceptadaEn: AHORA,
    versionPrivacidad: '2026-11-1',
    creadoEn: AHORA,
    actualizadoEn: AHORA,
    ...cambios,
  };
}

describe('RF-USU-02: entidad Usuario', () => {
  describe('Vendedor semilla (D-07, PA-09)', () => {
    it('Dado los datos del vendedor, cuando se crea, entonces tiene rol VENDEDOR, está activo y no tiene aceptación de privacidad', () => {
      const vendedor = Usuario.crearVendedor(datosBase);

      expect(vendedor.rol).toBe('VENDEDOR');
      expect(vendedor.esVendedor()).toBe(true);
      expect(vendedor.esCliente()).toBe(false);
      expect(vendedor.activo).toBe(true);
      expect(vendedor.privacidadAceptadaEn).toBeNull();
      expect(vendedor.versionPrivacidad).toBeNull();
      expect(vendedor.creadoEn).toEqual(AHORA);
      expect(vendedor.actualizadoEn).toEqual(AHORA);
      expect(vendedor.correo.valor).toBe('maria.zambrano@correo.com');
      expect(vendedor.telefono.valor).toBe('+593991234567');
      expect(vendedor.nombre.valor).toBe('María Zambrano');
      expect(vendedor.id).toBe(datosBase.id);
    });
  });

  describe('Cliente (RNF-16)', () => {
    it('Dado un cliente nuevo, cuando se crea, entonces guarda la fecha y la versión del aviso aceptado', () => {
      const cliente = Usuario.crearCliente({
        ...datosBase,
        versionPrivacidad: '2026-11-1',
      });

      expect(cliente.rol).toBe('CLIENTE');
      expect(cliente.esCliente()).toBe(true);
      expect(cliente.activo).toBe(true);
      expect(cliente.privacidadAceptadaEn).toEqual(AHORA);
      expect(cliente.versionPrivacidad).toBe('2026-11-1');
    });

    it.each([
      ['sin fecha de aceptación', { privacidadAceptadaEn: null }],
      ['sin versión del aviso', { versionPrivacidad: null }],
    ])('un Cliente %s no es válido', (_caso, cambios) => {
      expect(() => Usuario.reconstituir(propiedades(cambios))).toThrow(
        ReglaNegocioError,
      );
    });

    it('un Vendedor reconstituido sin aceptación de privacidad es válido', () => {
      const vendedor = Usuario.reconstituir(
        propiedades({
          rol: 'VENDEDOR',
          privacidadAceptadaEn: null,
          versionPrivacidad: null,
        }),
      );
      expect(vendedor.esVendedor()).toBe(true);
    });
  });

  it('RNF-02: no se puede crear un usuario sin el hash de su clave', () => {
    expect(() =>
      Usuario.crearVendedor({ ...datosBase, hashClave: '' }),
    ).toThrow('El usuario debe tener el hash de su clave.');
  });

  it('reconstituye un usuario guardado con todos sus datos, incluido el estado inactivo', () => {
    const usuario = Usuario.reconstituir(propiedades({ activo: false }));
    expect(usuario.activo).toBe(false);
    expect(usuario.hashClave).toBe(HASH_FICTICIO);
  });

  describe('RNF-02: el hash de la clave no sale del dominio por accidente', () => {
    const vendedor = Usuario.crearVendedor(datosBase);

    it('los datos públicos no incluyen el hash', () => {
      const publico = vendedor.aPublico();
      expect(publico).toEqual({
        id: datosBase.id,
        nombre: 'María Zambrano',
        correo: 'maria.zambrano@correo.com',
        telefono: '+593991234567',
        rol: 'VENDEDOR',
        privacidadAceptadaEn: null,
        versionPrivacidad: null,
        creadoEn: AHORA,
      });
      expect(JSON.stringify(publico)).not.toContain(HASH_FICTICIO);
    });

    it('JSON.stringify del usuario no incluye el hash', () => {
      expect(JSON.stringify(vendedor)).not.toContain(HASH_FICTICIO);
      expect(JSON.stringify(vendedor)).not.toContain('hashClave');
    });

    it('util.inspect (lo que muestra console.log) no incluye el hash', () => {
      expect(inspect(vendedor, { depth: 5 })).not.toContain(HASH_FICTICIO);
    });
  });
});
