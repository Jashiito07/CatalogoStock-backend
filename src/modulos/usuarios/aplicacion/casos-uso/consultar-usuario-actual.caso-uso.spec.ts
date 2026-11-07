import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import { ConsultarUsuarioActualCasoUso } from './consultar-usuario-actual.caso-uso.js';
import {
  crearCliente,
  crearVendedor,
  desactivar,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';

function preparar() {
  const usuarios = new UsuarioRepositorioEnMemoria();
  return { usuarios, casoUso: new ConsultarUsuarioActualCasoUso(usuarios) };
}

describe('RF-USU-01 / RF-USU-02: ConsultarUsuarioActual (GET /usuarios/yo)', () => {
  it('Dado un Cliente activo, entonces devuelve sus datos públicos sin el hash de la clave', async () => {
    const { usuarios, casoUso } = preparar();
    usuarios.usuarios.push(
      crearCliente('cliente-1', 'maria@ejemplo.test'),
      crearCliente('cliente-2', 'pedro@ejemplo.test'),
    );

    const usuario = await casoUso.ejecutar('cliente-1');

    expect(usuario).toMatchObject({
      id: 'cliente-1',
      correo: 'maria@ejemplo.test',
      rol: 'CLIENTE',
    });
    expect(Object.keys(usuario)).not.toContain('hashClave');
    expect(JSON.stringify(usuario)).not.toContain('hash:');
  });

  it('Dado el Vendedor activo, entonces devuelve sus datos con rol VENDEDOR', async () => {
    const { usuarios, casoUso } = preparar();
    usuarios.usuarios.push(
      crearVendedor('vendedor-1', 'vendedor@ejemplo.test'),
    );

    await expect(casoUso.ejecutar('vendedor-1')).resolves.toMatchObject({
      id: 'vendedor-1',
      rol: 'VENDEDOR',
      privacidadAceptadaEn: null,
    });
  });

  it('una cuenta que ya no existe → 401 NO_AUTENTICADO', async () => {
    const { casoUso } = preparar();

    await expect(casoUso.ejecutar('no-existe')).rejects.toBeInstanceOf(
      TokenAccesoAusenteError,
    );
  });

  it('una cuenta inactiva → 401 NO_AUTENTICADO', async () => {
    const { usuarios, casoUso } = preparar();
    usuarios.usuarios.push(
      desactivar(crearCliente('cliente-1', 'maria@ejemplo.test')),
    );

    await expect(casoUso.ejecutar('cliente-1')).rejects.toMatchObject({
      codigo: 'NO_AUTENTICADO',
    });
  });
});
