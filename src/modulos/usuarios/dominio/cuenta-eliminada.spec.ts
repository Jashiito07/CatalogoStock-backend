import { Correo } from './correo.js';
import { datosAnonimosDe, NOMBRE_CUENTA_ELIMINADA } from './cuenta-eliminada.js';
import { NombreUsuario } from './nombre-usuario.js';
import { Telefono } from './telefono.js';
import { Usuario } from './usuario.js';

const ID_A = '6f1c0000-0000-4000-8000-0000000000a1';
const ID_B = '6f1c0000-0000-4000-8000-0000000000b2';

describe('RF-USU-06 / PA-21: datos anonimizados de la cuenta eliminada', () => {
  it('el nombre es «Cuenta eliminada» y el correo es único y no entregable (.invalid)', () => {
    const a = datosAnonimosDe(ID_A);
    expect(a.nombre).toBe(NOMBRE_CUENTA_ELIMINADA);
    expect(a.correo).toBe(`eliminada-${ID_A}@eliminada.invalid`);
    expect(Correo.crear(a.correo).valor).toBe(a.correo);
    expect(datosAnonimosDe(ID_B).correo).not.toBe(a.correo);
  });

  it('el teléfono es único, tiene el formato +000 y 9 dígitos y no es un celular válido de Ecuador', () => {
    const a = datosAnonimosDe(ID_A);
    expect(a.telefono).toMatch(/^\+000\d{9}$/);
    expect(datosAnonimosDe(ID_B).telefono).not.toBe(a.telefono);
    expect(() => Telefono.crear(a.telefono)).toThrow('celular de Ecuador');
    expect(Telefono.deCuentaEliminada(a.telefono).valor).toBe(a.telefono);
  });

  it('solo se acepta el formato anonimizado como teléfono de una cuenta eliminada', () => {
    expect(() => Telefono.deCuentaEliminada('+593991234567')).toThrow('celular de Ecuador');
    expect(() => Telefono.deCuentaEliminada('0991234567')).toThrow('celular de Ecuador');
  });

  it('el usuario sabe si está eliminado según eliminadoEn', () => {
    const base = {
      id: ID_A,
      nombre: NombreUsuario.crear('María Zambrano'),
      correo: Correo.crear('maria@ejemplo.test'),
      telefono: Telefono.crear('0991234567'),
      hashClave: 'hash',
      rol: 'CLIENTE' as const,
      activo: true,
      privacidadAceptadaEn: new Date(),
      versionPrivacidad: '2026-11-1',
      correoVerificadoEn: null,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    };
    expect(Usuario.reconstituir(base).estaEliminada()).toBe(false);
    expect(
      Usuario.reconstituir({ ...base, eliminadoEn: new Date() }).estaEliminada(),
    ).toBe(true);
  });
});
