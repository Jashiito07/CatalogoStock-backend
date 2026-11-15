import { Correo } from './correo.js';
import { NombreUsuario } from './nombre-usuario.js';
import { Telefono } from './telefono.js';
import { Usuario } from './usuario.js';

const AHORA = new Date('2026-11-11T15:00:00.000Z');
const VERIFICADO = new Date('2026-11-11T15:05:00.000Z');

const datos = {
  id: '6f1c0000-0000-4000-8000-000000000001',
  nombre: NombreUsuario.crear('María Zambrano'),
  correo: Correo.crear('maria@ejemplo.test'),
  telefono: Telefono.crear('0991234567'),
  hashClave: '$2b$12$hashficticiodepruebahashficticiodepruebahashficticio',
  ahora: AHORA,
};

describe('Contrato de correo: correo verificado del usuario', () => {
  it('una cuenta nueva (Cliente o Vendedor) empieza con el correo sin verificar', () => {
    const cliente = Usuario.crearCliente({
      ...datos,
      versionPrivacidad: '2026-11-1',
    });
    const vendedor = Usuario.crearVendedor(datos);

    for (const usuario of [cliente, vendedor]) {
      expect(usuario.correoVerificadoEn).toBeNull();
      expect(usuario.tieneCorreoVerificado()).toBe(false);
      expect(usuario.aPublico().correoVerificadoEn).toBeNull();
    }
  });

  it('una cuenta con la fecha de verificación tiene el correo verificado y la expone en los datos públicos', () => {
    const base = Usuario.crearVendedor(datos);
    const verificado = Usuario.reconstituir({
      id: base.id,
      nombre: base.nombre,
      correo: base.correo,
      telefono: base.telefono,
      hashClave: base.hashClave,
      rol: base.rol,
      activo: true,
      privacidadAceptadaEn: null,
      versionPrivacidad: null,
      correoVerificadoEn: VERIFICADO,
      creadoEn: AHORA,
      actualizadoEn: VERIFICADO,
    });

    expect(verificado.tieneCorreoVerificado()).toBe(true);
    expect(verificado.correoVerificadoEn).toEqual(VERIFICADO);
    expect(verificado.aPublico().correoVerificadoEn).toEqual(VERIFICADO);
    expect(JSON.stringify(verificado)).not.toContain(base.hashClave);
  });
});
