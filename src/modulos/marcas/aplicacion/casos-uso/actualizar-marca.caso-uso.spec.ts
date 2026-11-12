import { ActualizarMarcaCasoUso } from './actualizar-marca.caso-uso.js';
import { CrearMarcaCasoUso } from './crear-marca.caso-uso.js';
import {
  AuditoriaFalsa,
  generadorIdSecuencial,
  ID_VENDEDOR,
  MarcaRepositorioEnMemoria,
  RelojFalso,
  UnidadDeTrabajoFalsa,
} from './dobles.prueba-spec.js';

describe('RF-PRO-04: ActualizarMarcaCasoUso', () => {
  let marcas: MarcaRepositorioEnMemoria;
  let unidad: UnidadDeTrabajoFalsa;
  let auditoria: AuditoriaFalsa;
  let crear: CrearMarcaCasoUso;
  let caso: ActualizarMarcaCasoUso;

  beforeEach(() => {
    marcas = new MarcaRepositorioEnMemoria();
    unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    const reloj = new RelojFalso();
    crear = new CrearMarcaCasoUso(
      marcas,
      generadorIdSecuencial(),
      reloj,
      unidad,
      auditoria,
    );
    caso = new ActualizarMarcaCasoUso(marcas, reloj, unidad, auditoria);
  });

  const nueva = (nombre: string, color = '#FC5823') =>
    crear.ejecutar({ idVendedor: ID_VENDEDOR, nombre, color });

  const actualizar = (idMarca: string, cambios: Record<string, unknown>) =>
    caso.ejecutar({ idVendedor: ID_VENDEDOR, idMarca, cambios });

  it('cambia solo lo enviado y registra MARCA_ACTUALIZADA con los campos cambiados', async () => {
    const marca = await nueva('Yanbal');
    auditoria.registradas.length = 0;

    const actualizada = await actualizar(marca.id, {
      color: '#2e1a47',
      activa: false,
    });

    expect(actualizada).toMatchObject({
      nombre: 'Yanbal',
      color: '#2E1A47',
      textoSobreColor: '#FFFFFF',
      activa: false,
    });
    expect(auditoria.registradas).toEqual([
      {
        actividad: {
          accion: 'MARCA_ACTUALIZADA',
          idUsuario: ID_VENDEDOR,
          entidad: 'MARCA',
          idEntidad: marca.id,
          detalle: { campos: ['color', 'activa'] },
        },
        enTransaccion: true,
      },
    ]);
  });

  it('colorAcento null quita el acento', async () => {
    const marca = await crear.ejecutar({
      idVendedor: ID_VENDEDOR,
      nombre: 'Leonisa',
      color: '#222221',
      colorAcento: '#F36E21',
    });
    const actualizada = await actualizar(marca.id, { colorAcento: null });
    expect(actualizada.colorAcento).toBeNull();
    expect(actualizada.textoSobreAcento).toBeNull();
  });

  it('una marca desactivada se puede volver a activar', async () => {
    const marca = await nueva('Avon', '#FF2469');
    await actualizar(marca.id, { activa: false });
    const activa = await actualizar(marca.id, { activa: true });
    expect(activa.activa).toBe(true);
  });

  it('sin cambios reales no escribe ni registra', async () => {
    const marca = await nueva('Yanbal');
    auditoria.registradas.length = 0;
    const resultado = await actualizar(marca.id, { nombre: 'Yanbal' });
    expect(resultado.id).toBe(marca.id);
    expect(auditoria.registradas).toHaveLength(0);
    const vacio = await actualizar(marca.id, {});
    expect(vacio.id).toBe(marca.id);
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('un id inexistente → NO_ENCONTRADO', async () => {
    await expect(
      actualizar('00000000-0000-4000-8000-0000000000ff', { activa: false }),
    ).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      categoria: 'NO_ENCONTRADO',
    });
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('RF-PRO-04: renombrar a un nombre de otra marca → MARCA_DUPLICADA y nada cambia', async () => {
    await nueva('Yanbal');
    const avon = await nueva('Avon', '#FF2469');
    auditoria.registradas.length = 0;
    await expect(
      actualizar(avon.id, { nombre: 'ÝANBAL' }),
    ).rejects.toMatchObject({ codigo: 'MARCA_DUPLICADA' });
    expect((await marcas.buscarPorId(avon.id))?.nombre.valor).toBe('Avon');
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('puede cambiar solo mayúsculas o tildes de su propio nombre', async () => {
    const marca = await nueva('esika', '#E1251B');
    const actualizada = await actualizar(marca.id, { nombre: 'Ésika' });
    expect(actualizada.nombre).toBe('Ésika');
  });

  it('RNF-03: datos inválidos → DATOS_INVALIDOS y la marca no cambia', async () => {
    const marca = await nueva('Yanbal');
    for (const malo of [
      { nombre: 'x' },
      { nombre: null },
      { color: null },
      { color: '#12' },
      { colorAcento: 'azul' },
      { activa: 'false' },
      { orden: 1.5 },
    ]) {
      await expect(actualizar(marca.id, malo)).rejects.toMatchObject({
        codigo: 'DATOS_INVALIDOS',
      });
    }
    expect(marcas.marcas[0].color).toBe('#FC5823');
  });
});
