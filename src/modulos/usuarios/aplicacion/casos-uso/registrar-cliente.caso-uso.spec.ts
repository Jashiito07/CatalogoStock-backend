import { DatosInvalidosError } from '../../../../compartido/dominio/errores.js';
import { GeneradorHashBcrypt } from '../../infraestructura/seguridad/generador-hash.bcrypt.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import {
  AVISO_VIGENTE,
  crearCliente,
  crearVendedor,
  FuenteAvisoFalsa,
  GeneradorHashFalso,
  generadorIdSecuencial,
  INICIO,
  RelojFalso,
  UsuarioRepositorioEnMemoria,
} from './dobles.prueba-spec.js';
import {
  type DatosRegistrarCliente,
  RegistrarClienteCasoUso,
} from './registrar-cliente.caso-uso.js';

const DATOS: DatosRegistrarCliente = {
  nombre: '  María Zambrano ',
  correo: 'Maria.Zambrano@Correo.com',
  telefono: '099-123 4567',
  clave: 'Catalogo2026',
  aceptaPrivacidad: true,
  versionPrivacidad: AVISO_VIGENTE.version,
};

function preparar(generadorHash: GeneradorHash = new GeneradorHashFalso()) {
  const usuarios = new UsuarioRepositorioEnMemoria();
  const casoUso = new RegistrarClienteCasoUso(
    usuarios,
    generadorHash,
    new FuenteAvisoFalsa(),
    generadorIdSecuencial(),
    new RelojFalso(),
  );
  return { usuarios, casoUso };
}

describe('RF-USU-01 / CA-01 / D-07 / D-11: RegistrarClienteCasoUso', () => {
  it('Dado datos válidos, cuando se registra, entonces crea un CLIENTE con datos normalizados y aceptación del aviso', async () => {
    const { usuarios, casoUso } = preparar();

    const publico = await casoUso.ejecutar(DATOS);

    expect(publico).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      nombre: 'María Zambrano',
      correo: 'maria.zambrano@correo.com',
      telefono: '+593991234567',
      rol: 'CLIENTE',
      privacidadAceptadaEn: INICIO,
      versionPrivacidad: '2026-11-1',
      creadoEn: INICIO,
    });
    expect(usuarios.usuarios).toHaveLength(1);
    expect(usuarios.usuarios[0].activo).toBe(true);
  });

  it('D-07: siempre asigna el rol CLIENTE (no existe forma de pedir otro rol)', async () => {
    const { usuarios, casoUso } = preparar();
    // Aunque llegue un campo extra por error, el caso de uso no lo lee.
    await casoUso.ejecutar({
      ...DATOS,
      rol: 'VENDEDOR',
    } as DatosRegistrarCliente);

    expect(usuarios.usuarios[0].rol).toBe('CLIENTE');
  });

  it('RNF-02: guarda la clave solo como hash bcrypt, nunca en texto plano, y no la devuelve', async () => {
    const bcrypt = new GeneradorHashBcrypt(10);
    const { usuarios, casoUso } = preparar(bcrypt);

    const publico = await casoUso.ejecutar(DATOS);

    const [guardado] = usuarios.usuarios;
    expect(guardado.hashClave).toMatch(/^\$2b\$10\$/);
    expect(guardado.hashClave).not.toContain(DATOS.clave);
    expect(JSON.stringify(publico)).not.toContain('hash');
    expect(JSON.stringify(publico)).not.toContain(DATOS.clave);
    await expect(
      bcrypt.comparar(DATOS.clave, guardado.hashClave),
    ).resolves.toBe(true);
  });

  it('RNF-03: lista todos los campos inválidos a la vez y no crea nada', async () => {
    const hash = new GeneradorHashFalso();
    const { usuarios, casoUso } = preparar(hash);

    const ejecucion = casoUso.ejecutar({
      ...DATOS,
      nombre: 'A',
      correo: 'sin-arroba',
      telefono: '052123456',
      clave: 'sinnumeros',
    });

    await expect(ejecucion).rejects.toBeInstanceOf(DatosInvalidosError);
    const error = await ejecucion.catch((e: unknown) => e);
    expect(error).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      detalles: {
        errores: [
          { campo: 'nombre' },
          { campo: 'correo' },
          { campo: 'telefono' },
          { campo: 'clave' },
        ],
      },
    });
    // Nunca repite los valores enviados.
    expect(JSON.stringify(error)).not.toContain('sinnumeros');
    expect(usuarios.usuarios).toHaveLength(0);
    expect(hash.generadas).toHaveLength(0);
  });

  it('D-14: un teléfono fijo o extranjero → DATOS_INVALIDOS', async () => {
    const { casoUso } = preparar();

    await expect(
      casoUso.ejecutar({ ...DATOS, telefono: '+12025550123' }),
    ).rejects.toMatchObject({ detalles: { errores: [{ campo: 'telefono' }] } });
  });

  it('RNF-16: sin aceptar el aviso → PRIVACIDAD_NO_ACEPTADA y no crea nada', async () => {
    const { usuarios, casoUso } = preparar();

    await expect(
      casoUso.ejecutar({ ...DATOS, aceptaPrivacidad: false }),
    ).rejects.toMatchObject({ codigo: 'PRIVACIDAD_NO_ACEPTADA' });
    expect(usuarios.usuarios).toHaveLength(0);
  });

  it('D-11: con una versión del aviso que no es la vigente → PRIVACIDAD_DESACTUALIZADA', async () => {
    const { usuarios, casoUso } = preparar();

    await expect(
      casoUso.ejecutar({ ...DATOS, versionPrivacidad: '2025-01-1' }),
    ).rejects.toMatchObject({
      codigo: 'PRIVACIDAD_DESACTUALIZADA',
      detalles: { versionVigente: '2026-11-1' },
    });
    expect(usuarios.usuarios).toHaveLength(0);
  });

  it('correo ya registrado (con otra mayúscula) → CORREO_YA_REGISTRADO sin calcular hash', async () => {
    const hash = new GeneradorHashFalso();
    const { usuarios, casoUso } = preparar(hash);
    usuarios.usuarios.push(
      crearCliente('ya-existe', 'maria.zambrano@correo.com'),
    );

    await expect(casoUso.ejecutar(DATOS)).rejects.toMatchObject({
      codigo: 'CORREO_YA_REGISTRADO',
    });
    expect(usuarios.usuarios).toHaveLength(1);
    expect(hash.generadas).toHaveLength(0);
  });

  it('el correo del Vendedor tampoco se puede usar para registrarse', async () => {
    const { usuarios, casoUso } = preparar();
    usuarios.usuarios.push(crearVendedor('v', 'maria.zambrano@correo.com'));

    await expect(casoUso.ejecutar(DATOS)).rejects.toMatchObject({
      codigo: 'CORREO_YA_REGISTRADO',
    });
  });

  it('si otro registro gana la carrera, el índice único responde CORREO_YA_REGISTRADO', async () => {
    const { usuarios, casoUso } = preparar();
    usuarios.buscarPorCorreo = () => Promise.resolve(null);
    usuarios.usuarios.push(
      crearCliente('carrera', 'maria.zambrano@correo.com'),
    );

    await expect(casoUso.ejecutar(DATOS)).rejects.toMatchObject({
      codigo: 'CORREO_YA_REGISTRADO',
    });
  });

  it('un error inesperado al validar se propaga tal cual', async () => {
    const { casoUso } = preparar();
    const fallo = new Error('fallo');
    const datos = {
      ...DATOS,
      get nombre(): string {
        throw fallo;
      },
    };

    await expect(casoUso.ejecutar(datos)).rejects.toBe(fallo);
  });
});
