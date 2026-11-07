import {
  ConsultarResumenesUsuariosCasoUso,
  MAXIMO_IDS_RESUMEN,
} from './consultar-resumenes-usuarios.caso-uso.js';
import {
  crearCliente,
  crearVendedor,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';

function preparar() {
  const usuarios = new UsuarioRepositorioEnMemoria();
  usuarios.usuarios.push(
    crearCliente('id-ana', 'ana@ejemplo.test'),
    crearVendedor('id-vendedor', 'vendedor@ejemplo.test'),
  );
  return { usuarios, casoUso: new ConsultarResumenesUsuariosCasoUso(usuarios) };
}

describe('RF-USU-04: ConsultarResumenesUsuariosCasoUso (servicio público para la bitácora)', () => {
  it('devuelve solo { id, nombre, rol }, sin correo, teléfono ni hash', async () => {
    const { casoUso } = preparar();

    const resumenes = await casoUso.ejecutar(['id-ana', 'id-vendedor']);

    expect(resumenes).toEqual([
      { id: 'id-ana', nombre: 'Cliente de Prueba', rol: 'CLIENTE' },
      { id: 'id-vendedor', nombre: 'Vendedor de Prueba', rol: 'VENDEDOR' },
    ]);
    const texto = JSON.stringify(resumenes);
    expect(texto).not.toContain('@');
    expect(texto).not.toContain('hash');
  });

  it('omite los ids que no existen y no repite consultas por ids duplicados', async () => {
    const { usuarios, casoUso } = preparar();
    const buscar = vi.spyOn(usuarios, 'buscarPorIds');

    const resumenes = await casoUso.ejecutar(['id-ana', 'id-ana', 'no-existe']);

    expect(resumenes.map((r) => r.id)).toEqual(['id-ana']);
    expect(buscar).toHaveBeenCalledWith(['id-ana', 'no-existe']);
  });

  it('sin ids no consulta la base', async () => {
    const { usuarios, casoUso } = preparar();
    const buscar = vi.spyOn(usuarios, 'buscarPorIds');

    await expect(casoUso.ejecutar([])).resolves.toEqual([]);
    expect(buscar).not.toHaveBeenCalled();
  });

  it(`rechaza más de ${MAXIMO_IDS_RESUMEN} ids a la vez`, async () => {
    const { casoUso } = preparar();
    const ids = Array.from(
      { length: MAXIMO_IDS_RESUMEN + 1 },
      (_, i) => `id-${i}`,
    );

    await expect(casoUso.ejecutar(ids)).rejects.toBeInstanceOf(RangeError);
  });
});
