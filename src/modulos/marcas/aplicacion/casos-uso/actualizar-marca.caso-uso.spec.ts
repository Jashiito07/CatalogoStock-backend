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
    const marca = await nueva('Mi Tienda', '#FC5823');
    auditoria.registradas.length = 0;

    const actualizada = await actualizar(marca.id, {
      color: '#2e1a47',
      activa: false,
    });

    expect(actualizada).toMatchObject({
      nombre: 'Mi Tienda',
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
      nombre: 'Mi Tienda',
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
    await nueva('Mi Tienda');
    const otra = await nueva('Otra Tienda');
    auditoria.registradas.length = 0;
    await expect(
      actualizar(otra.id, { nombre: 'MI TIENDA' }),
    ).rejects.toMatchObject({ codigo: 'MARCA_DUPLICADA' });
    expect((await marcas.buscarPorId(otra.id))?.nombre.valor).toBe(
      'Otra Tienda',
    );
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('una marca propia puede cambiar mayúsculas o tildes de su propio nombre', async () => {
    const marca = await nueva('mi tienda');
    const actualizada = await actualizar(marca.id, { nombre: 'Mi Tiénda' });
    expect(actualizada.nombre).toBe('Mi Tiénda');
  });

  describe('D-56: marcas conocidas y colores fijos', () => {
    it('PATCH con otro color a una conocida → COLOR_MARCA_FIJO (422) y nada cambia', async () => {
      const marca = await nueva('Yanbal');
      auditoria.registradas.length = 0;
      await expect(
        actualizar(marca.id, { color: '#2E1A47' }),
      ).rejects.toMatchObject({
        codigo: 'COLOR_MARCA_FIJO',
        categoria: 'REGLA_NEGOCIO',
        message: 'Los colores de una marca conocida no se pueden cambiar.',
      });
      expect(marcas.marcas[0].color).toBe('#FC5823');
      expect(auditoria.registradas).toHaveLength(0);
    });

    it('quitar o cambiar el acento oficial de Leonisa → COLOR_MARCA_FIJO', async () => {
      const marca = await nueva('Leonisa');
      await expect(
        actualizar(marca.id, { colorAcento: null }),
      ).rejects.toMatchObject({ codigo: 'COLOR_MARCA_FIJO' });
      await expect(
        actualizar(marca.id, { colorAcento: '#FFFFFF' }),
      ).rejects.toMatchObject({ codigo: 'COLOR_MARCA_FIJO' });
      expect(marcas.marcas[0].colorAcento).toBe('#F36E21');
    });

    it('poner un acento a una conocida sin acento → COLOR_MARCA_FIJO', async () => {
      const marca = await nueva('Avon');
      await expect(
        actualizar(marca.id, { colorAcento: '#F36E21' }),
      ).rejects.toMatchObject({ codigo: 'COLOR_MARCA_FIJO' });
    });

    it('enviar los mismos colores oficiales no es error ni cambia nada', async () => {
      const marca = await nueva('Leonisa');
      auditoria.registradas.length = 0;
      const resultado = await actualizar(marca.id, {
        color: '#222221',
        colorAcento: '#f36e21',
      });
      expect(resultado.color).toBe('#222221');
      expect(auditoria.registradas).toHaveLength(0);
    });

    it('activa y orden se siguen pudiendo cambiar en una conocida', async () => {
      const marca = await nueva('Yanbal');
      const resultado = await actualizar(marca.id, {
        activa: false,
        orden: 5,
      });
      expect(resultado).toMatchObject({
        activa: false,
        orden: 5,
        color: '#FC5823',
      });
    });

    it('renombrar una conocida a otro nombre → NOMBRE_MARCA_FIJO (422)', async () => {
      const marca = await nueva('Yanbal');
      for (const nombre of ['Mi Tienda', 'Avon']) {
        await expect(actualizar(marca.id, { nombre })).rejects.toMatchObject({
          codigo: 'NOMBRE_MARCA_FIJO',
          categoria: 'REGLA_NEGOCIO',
        });
      }
      expect(marcas.marcas[0].nombre.valor).toBe('Yanbal');
    });

    it('una variante del propio nombre se acepta y se guarda el nombre oficial', async () => {
      const marca = await nueva("L'Bel");
      for (const variante of ['lbel', 'L´Bel', "L'BEL"]) {
        const resultado = await actualizar(marca.id, { nombre: variante });
        expect(resultado.nombre).toBe("L'Bel");
      }
    });

    it('una marca propia renombrada a un nombre conocido recibe los colores oficiales', async () => {
      const marca = await nueva('Mi Tienda', '#123456');
      const resultado = await actualizar(marca.id, {
        nombre: 'AVON',
        color: '#000000',
      });
      expect(resultado).toMatchObject({
        nombre: 'Avon',
        color: '#FF2469',
        colorAcento: null,
        textoSobreColor: '#0F172A',
      });
    });

    it('una marca propia conserva colores libres', async () => {
      const marca = await nueva('Mi Tienda');
      const resultado = await actualizar(marca.id, {
        color: '#123456',
        colorAcento: '#ABCDEF',
      });
      expect(resultado).toMatchObject({
        color: '#123456',
        colorAcento: '#ABCDEF',
      });
    });

    it('un color inválido en una conocida sigue siendo DATOS_INVALIDOS', async () => {
      const marca = await nueva('Yanbal');
      await expect(
        actualizar(marca.id, { color: 'rojo' }),
      ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
    });
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
