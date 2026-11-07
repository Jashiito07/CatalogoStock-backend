import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import { Correo } from '../../dominio/correo.js';
import {
  CorreoYaRegistradoError,
  VendedorYaExisteError,
} from '../../dominio/errores-usuario.js';
import { NombreUsuario } from '../../dominio/nombre-usuario.js';
import type { Rol } from '../../dominio/rol.js';
import { Telefono } from '../../dominio/telefono.js';
import { Usuario } from '../../dominio/usuario.js';
import { GeneradorHashBcrypt } from '../../infraestructura/seguridad/generador-hash.bcrypt.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';
import {
  CrearVendedorCasoUso,
  type DatosCrearVendedor,
} from './crear-vendedor.caso-uso.js';
import { AuditoriaFalsa, UnidadDeTrabajoFalsa } from './dobles.prueba-spec.js';

/** Repositorio en memoria con las mismas reglas de unicidad que la tabla. */
class UsuarioRepositorioEnMemoria implements UsuarioRepositorio {
  readonly usuarios: Usuario[] = [];

  buscarPorId(id: string): Promise<Usuario | null> {
    return Promise.resolve(this.usuarios.find((u) => u.id === id) ?? null);
  }

  buscarPorIds(ids: readonly string[]): Promise<Usuario[]> {
    return Promise.resolve(this.usuarios.filter((u) => ids.includes(u.id)));
  }

  buscarPorCorreo(correo: Correo): Promise<Usuario | null> {
    return Promise.resolve(
      this.usuarios.find((u) => u.correo.esIgualA(correo)) ?? null,
    );
  }

  existeConRol(rol: Rol): Promise<boolean> {
    return Promise.resolve(this.usuarios.some((u) => u.rol === rol));
  }

  crear(usuario: Usuario): Promise<void> {
    if (this.usuarios.some((u) => u.correo.esIgualA(usuario.correo))) {
      return Promise.reject(new CorreoYaRegistradoError());
    }
    // D-21: igual que el índice uq_usuarios_un_vendedor.
    if (usuario.esVendedor() && this.usuarios.some((u) => u.esVendedor())) {
      return Promise.reject(new VendedorYaExisteError());
    }
    this.usuarios.push(usuario);
    return Promise.resolve();
  }
}

/** Hash falso y rápido para las pruebas que no verifican bcrypt. */
class GeneradorHashFalso implements GeneradorHash {
  readonly recibidas: string[] = [];

  generar(clave: string): Promise<string> {
    this.recibidas.push(clave);
    return Promise.resolve(`hash-falso:${clave.length}`);
  }

  comparar(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

const AHORA = new Date('2026-11-05T15:00:00.000Z');
const reloj: Reloj = { ahora: () => AHORA };

function generadorIdSecuencial(): GeneradorId {
  let siguiente = 1;
  return {
    generar: () =>
      `00000000-0000-4000-8000-${String(siguiente++).padStart(12, '0')}`,
  };
}

const DATOS_VALIDOS: DatosCrearVendedor = {
  nombre: '  Vendedor de Prueba ',
  correo: 'Vendedor.Prueba@Ejemplo.TEST',
  telefono: '099 123 4567',
  clave: 'ClavePrueba2026',
};

function preparar(generadorHash: GeneradorHash = new GeneradorHashFalso()) {
  const repositorio = new UsuarioRepositorioEnMemoria();
  const unidad = new UnidadDeTrabajoFalsa();
  const auditoria = new AuditoriaFalsa(unidad);
  const casoUso = new CrearVendedorCasoUso(
    repositorio,
    generadorHash,
    generadorIdSecuencial(),
    reloj,
    unidad,
    auditoria,
  );
  return { repositorio, casoUso, generadorHash, auditoria };
}

describe('RF-USU-04: CrearVendedorCasoUso registra VENDEDOR_CREADO', () => {
  it('Dado que no existe ningún Vendedor, al crearlo deja VENDEDOR_CREADO con origen COMANDO_SEMILLA en la misma transacción', async () => {
    const { casoUso, auditoria } = preparar();

    const resultado = await casoUso.ejecutar(DATOS_VALIDOS);

    const idUsuario = resultado.creado ? resultado.idUsuario : '';
    expect(auditoria.registradas).toEqual([
      {
        actividad: {
          accion: 'VENDEDOR_CREADO',
          idUsuario,
          entidad: 'USUARIO',
          idEntidad: idUsuario,
          detalle: { origen: 'COMANDO_SEMILLA' },
        },
        enTransaccion: true,
        sinInterrumpir: false,
      },
    ]);
    expect(JSON.stringify(auditoria.registradas)).not.toContain(
      DATOS_VALIDOS.clave,
    );
  });

  it('si ya existe un Vendedor (o la base rechaza el segundo), no registra nada', async () => {
    const { repositorio, casoUso, auditoria } = preparar();
    await casoUso.ejecutar(DATOS_VALIDOS);
    await casoUso.ejecutar(DATOS_VALIDOS);
    repositorio.existeConRol = () => Promise.resolve(false);
    repositorio.crear = () => Promise.reject(new VendedorYaExisteError());
    await casoUso.ejecutar({ ...DATOS_VALIDOS, correo: 'otro@ejemplo.test' });

    expect(auditoria.acciones()).toEqual(['VENDEDOR_CREADO']);
  });

  it('si la bitácora falla, el comando falla (la transacción deshace el Vendedor)', async () => {
    const { casoUso, auditoria } = preparar();
    const fallo = new Error('bitácora no disponible');
    auditoria.fallo = fallo;

    await expect(casoUso.ejecutar(DATOS_VALIDOS)).rejects.toBe(fallo);
  });
});

function clienteExistente(correo: string): Usuario {
  return Usuario.crearCliente({
    id: '00000000-0000-4000-8000-0000000000aa',
    nombre: NombreUsuario.crear('Cliente Existente'),
    correo: Correo.crear(correo),
    telefono: Telefono.crear('0987654321'),
    hashClave: 'hash-del-cliente',
    versionPrivacidad: '2026-11-1',
    ahora: AHORA,
  });
}

describe('D-07 / PA-09 / RF-USU-02: CrearVendedorCasoUso', () => {
  it('Dado que no existe ningún Vendedor, cuando se ejecuta, entonces crea uno con rol VENDEDOR y datos normalizados', async () => {
    const { repositorio, casoUso } = preparar();

    const resultado = await casoUso.ejecutar(DATOS_VALIDOS);

    expect(resultado).toEqual({
      creado: true,
      idUsuario: '00000000-0000-4000-8000-000000000001',
    });
    expect(repositorio.usuarios).toHaveLength(1);
    const [vendedor] = repositorio.usuarios;
    expect(vendedor.rol).toBe('VENDEDOR');
    expect(vendedor.activo).toBe(true);
    expect(vendedor.nombre.valor).toBe('Vendedor de Prueba');
    expect(vendedor.correo.valor).toBe('vendedor.prueba@ejemplo.test');
    expect(vendedor.telefono.valor).toBe('+593991234567');
    expect(vendedor.privacidadAceptadaEn).toBeNull();
    expect(vendedor.versionPrivacidad).toBeNull();
    expect(vendedor.creadoEn).toEqual(AHORA);
  });

  it('PA-09: Dado que ya existe un Vendedor, cuando se ejecuta otra vez, entonces no crea un segundo Vendedor', async () => {
    const { repositorio, casoUso } = preparar();
    await casoUso.ejecutar(DATOS_VALIDOS);

    const segundo = await casoUso.ejecutar({
      ...DATOS_VALIDOS,
      correo: 'otro.vendedor@ejemplo.test',
    });

    expect(segundo).toEqual({ creado: false, motivo: 'VENDEDOR_EXISTENTE' });
    expect(repositorio.usuarios.filter((u) => u.esVendedor())).toHaveLength(1);
    expect(repositorio.usuarios).toHaveLength(1);
  });

  it('PA-09: si ya existe un Vendedor no genera ningún hash ni valida datos nuevos', async () => {
    const generadorHash = new GeneradorHashFalso();
    const { casoUso } = preparar(generadorHash);
    await casoUso.ejecutar(DATOS_VALIDOS);

    const resultado = await casoUso.ejecutar({
      ...DATOS_VALIDOS,
      clave: 'debil',
    });

    expect(resultado.creado).toBe(false);
    expect(generadorHash.recibidas).toHaveLength(1);
  });

  it('RNF-02: la clave se guarda como hash bcrypt de costo 12 y nunca en texto plano', async () => {
    const bcrypt = new GeneradorHashBcrypt(12);
    const { repositorio, casoUso } = preparar(bcrypt);

    await casoUso.ejecutar(DATOS_VALIDOS);

    const [vendedor] = repositorio.usuarios;
    expect(vendedor.hashClave).not.toBe(DATOS_VALIDOS.clave);
    expect(vendedor.hashClave).not.toContain(DATOS_VALIDOS.clave);
    expect(vendedor.hashClave).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
    await expect(
      bcrypt.comparar(DATOS_VALIDOS.clave, vendedor.hashClave),
    ).resolves.toBe(true);
  });

  it('el correo se guarda en minúsculas', async () => {
    const { repositorio, casoUso } = preparar();
    await casoUso.ejecutar({
      ...DATOS_VALIDOS,
      correo: 'MAYUSCULAS@EJEMPLO.TEST',
    });
    expect(repositorio.usuarios[0].correo.valor).toBe(
      'mayusculas@ejemplo.test',
    );
  });

  it.each<[string, Partial<DatosCrearVendedor>]>([
    ['nombre', { nombre: 'A' }],
    ['correo', { correo: 'sin-arroba' }],
    ['telefono', { telefono: '052123456' }],
    ['clave', { clave: 'sinnumeros' }],
  ])(
    'con %s inválido falla con DATOS_INVALIDOS y no crea nada',
    async (campo, cambio) => {
      const generadorHash = new GeneradorHashFalso();
      const { repositorio, casoUso } = preparar(generadorHash);

      const ejecucion = casoUso.ejecutar({ ...DATOS_VALIDOS, ...cambio });

      await expect(ejecucion).rejects.toBeInstanceOf(DatosInvalidosError);
      await expect(ejecucion).rejects.toMatchObject({
        detalles: { errores: [{ campo }] },
      });
      expect(repositorio.usuarios).toHaveLength(0);
      expect(generadorHash.recibidas).toHaveLength(0);
    },
  );

  it('Dado un Cliente con el mismo correo (con otra mayúscula), entonces falla con CORREO_YA_REGISTRADO y no crea el Vendedor', async () => {
    const { repositorio, casoUso } = preparar();
    repositorio.usuarios.push(clienteExistente('vendedor.prueba@ejemplo.test'));

    await expect(casoUso.ejecutar(DATOS_VALIDOS)).rejects.toMatchObject({
      codigo: 'CORREO_YA_REGISTRADO',
    });
    expect(repositorio.usuarios.filter((u) => u.esVendedor())).toHaveLength(0);
  });

  it('D-21: si otra ejecución crea el Vendedor a la vez y la base rechaza el segundo, termina «sin cambios» (no es error)', async () => {
    const { repositorio, casoUso } = preparar();
    // Simula la carrera: la comprobación no ve ningún Vendedor, pero el
    // índice uq_usuarios_un_vendedor rechaza la inserción.
    repositorio.existeConRol = () => Promise.resolve(false);
    repositorio.crear = () => Promise.reject(new VendedorYaExisteError());

    await expect(casoUso.ejecutar(DATOS_VALIDOS)).resolves.toEqual({
      creado: false,
      motivo: 'VENDEDOR_EXISTENTE',
    });
  });

  it('cualquier otro error al guardar se propaga', async () => {
    const { repositorio, casoUso } = preparar();
    const fallo = new Error('fallo de conexión');
    repositorio.crear = () => Promise.reject(fallo);

    await expect(casoUso.ejecutar(DATOS_VALIDOS)).rejects.toBe(fallo);
  });

  it('un Cliente existente no impide crear el Vendedor', async () => {
    const { repositorio, casoUso } = preparar();
    repositorio.usuarios.push(clienteExistente('cliente@ejemplo.test'));

    const resultado = await casoUso.ejecutar(DATOS_VALIDOS);

    expect(resultado.creado).toBe(true);
    expect(repositorio.usuarios).toHaveLength(2);
  });
});
