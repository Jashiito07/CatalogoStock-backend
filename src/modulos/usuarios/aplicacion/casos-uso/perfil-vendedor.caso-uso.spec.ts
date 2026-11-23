import {
  ConsultarTiendaCasoUso,
  GuardarPerfilVendedorCasoUso,
  ObtenerPerfilVendedorCasoUso,
} from './perfil-vendedor.caso-uso.js';
import type { PerfilVendedorRepositorio } from '../puertos/perfil-vendedor.repositorio.js';
import type { PerfilVendedor } from '../../dominio/perfil-vendedor.js';
import {
  AuditoriaFalsa,
  crearVendedor,
  RelojFalso,
  UnidadDeTrabajoFalsa,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';

const ID = '00000000-0000-4000-8000-0000000000aa';
const ENTRADA = {
  nombreComercial: 'Belleza de Ana',
  ciudad: 'Portoviejo',
  provincia: 'Manabí',
  whatsapp: '0987000111',
};

class PerfilesEnMemoria implements PerfilVendedorRepositorio {
  perfiles = new Map<string, PerfilVendedor>();
  obtener(id: string): Promise<PerfilVendedor | null> {
    return Promise.resolve(this.perfiles.get(id) ?? null);
  }
  guardar(perfil: PerfilVendedor): Promise<void> {
    this.perfiles.set(perfil.idUsuario, perfil);
    return Promise.resolve();
  }
}

describe('RF-USU-08: perfil comercial y tienda (casos de uso)', () => {
  let perfiles: PerfilesEnMemoria;
  let usuarios: UsuarioRepositorioEnMemoria;
  let auditoria: AuditoriaFalsa;
  let obtener: ObtenerPerfilVendedorCasoUso;
  let guardar: GuardarPerfilVendedorCasoUso;
  let tienda: ConsultarTiendaCasoUso;

  beforeEach(async () => {
    perfiles = new PerfilesEnMemoria();
    usuarios = new UsuarioRepositorioEnMemoria();
    const unidad = new UnidadDeTrabajoFalsa();
    auditoria = new AuditoriaFalsa(unidad);
    obtener = new ObtenerPerfilVendedorCasoUso(perfiles);
    guardar = new GuardarPerfilVendedorCasoUso(perfiles, new RelojFalso(), unidad, auditoria);
    tienda = new ConsultarTiendaCasoUso(usuarios, perfiles);
    await usuarios.crear(crearVendedor(ID, 'vendedor@ejemplo.test'));
  });

  it('sin perfil devuelve todos los campos null', async () => {
    expect(await obtener.ejecutar(ID)).toEqual({
      nombreComercial: null,
      ciudad: null,
      provincia: null,
      whatsapp: null,
    });
  });

  it('guardar normaliza, persiste y registra solo los nombres de los campos en la misma transacción', async () => {
    const vista = await guardar.ejecutar(ID, ENTRADA);

    expect(vista.whatsapp).toBe('+593987000111');
    expect(await obtener.ejecutar(ID)).toEqual(vista);
    expect(auditoria.registradas).toEqual([
      {
        enTransaccion: true,
        sinInterrumpir: false,
        actividad: {
          accion: 'PERFIL_VENDEDOR_ACTUALIZADO',
          idUsuario: ID,
          entidad: 'USUARIO',
          idEntidad: ID,
          detalle: { campos: ['nombreComercial', 'ciudad', 'provincia', 'whatsapp'] },
        },
      },
    ]);
  });

  it('un campo inválido falla con 400 y no guarda ni registra nada', async () => {
    await expect(guardar.ejecutar(ID, { ...ENTRADA, provincia: 'Texas' })).rejects.toMatchObject({
      codigo: 'DATOS_INVALIDOS',
    });
    expect(perfiles.perfiles.size).toBe(0);
    expect(auditoria.registradas).toHaveLength(0);
  });

  it('la tienda responde 404 TIENDA_NO_CONFIGURADA sin perfil y con perfil trae pais EC y el WhatsApp', async () => {
    await expect(tienda.ejecutar()).rejects.toMatchObject({
      codigo: 'TIENDA_NO_CONFIGURADA',
      categoria: 'NO_ENCONTRADO',
    });
    await guardar.ejecutar(ID, ENTRADA);
    expect(await tienda.ejecutar()).toEqual({
      nombreComercial: 'Belleza de Ana',
      ciudad: 'Portoviejo',
      provincia: 'Manabí',
      pais: 'EC',
      whatsapp: '+593987000111',
    });
  });
});
