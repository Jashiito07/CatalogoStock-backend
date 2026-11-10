import { DatosInvalidosError } from '../../../compartido/dominio/errores.js';
import {
  ACCIONES_AUDITORIA,
  ENTIDAD_DE_LA_ACCION,
  esAccionAuditoria,
  esEntidadAuditoria,
} from './catalogo-auditoria.js';
import {
  type DatosNuevoRegistro,
  RegistroActividad,
} from './registro-actividad.js';

const ID = '00000000-0000-4000-8000-000000000001';
const ID_USUARIO = '00000000-0000-4000-8000-000000000002';
const ID_SESION = '00000000-0000-4000-8000-000000000003';
const FECHA = new Date('2026-11-05T15:16:02.000Z');

const BASE: DatosNuevoRegistro = {
  id: ID,
  fecha: FECHA,
  accion: 'SESION_INICIADA',
  idUsuario: ID_USUARIO,
  entidad: 'SESION',
  idEntidad: ID_SESION,
  detalle: { rol: 'CLIENTE', canal: 'APP' },
};

/** Campo señalado por el `DatosInvalidosError` (o `undefined` si no falla). */
function campoInvalido(datos: DatosNuevoRegistro): string | undefined {
  let error: unknown;
  try {
    RegistroActividad.crear(datos);
  } catch (e) {
    error = e;
  }
  if (!(error instanceof DatosInvalidosError)) {
    return undefined;
  }
  const errores = error.detalles?.errores as { campo: string }[];
  return errores[0].campo;
}

describe('RF-USU-04: RegistroActividad', () => {
  it('crea un registro con los datos del contrato', () => {
    const { registro, descartados } = RegistroActividad.crear(BASE);

    expect(descartados).toEqual([]);
    expect(registro.id).toBe(ID);
    expect(registro.fecha).toEqual(FECHA);
    expect(registro.accion).toBe('SESION_INICIADA');
    expect(registro.idUsuario).toBe(ID_USUARIO);
    expect(registro.entidad).toBe('SESION');
    expect(registro.idEntidad).toBe(ID_SESION);
    expect(registro.detalle).toEqual({ rol: 'CLIENTE', canal: 'APP' });
  });

  it('es de solo lectura: cambiar la fecha devuelta o el detalle no altera el registro', () => {
    const { registro } = RegistroActividad.crear(BASE);
    registro.fecha.setFullYear(2000);
    expect(registro.fecha).toEqual(FECHA);
    expect(Object.isFrozen(registro.detalle)).toBe(true);
  });

  it('pasa el detalle por la salvaguarda y devuelve los campos descartados', () => {
    const { registro, descartados } = RegistroActividad.crear({
      ...BASE,
      detalle: { rol: 'CLIENTE', tokenAcceso: 'secreto' },
    });
    expect(registro.detalle).toEqual({ rol: 'CLIENTE' });
    expect(descartados).toEqual(['tokenAcceso']);
  });

  it('admite un usuario desconocido (null) y ACCESO_DENEGADO sin entidad', () => {
    const { registro } = RegistroActividad.crear({
      ...BASE,
      accion: 'ACCESO_DENEGADO',
      idUsuario: null,
      entidad: null,
      idEntidad: null,
    });
    expect(registro.idUsuario).toBeNull();
    expect(registro.entidad).toBeNull();
  });

  it('SESION_FALLIDA admite idEntidad null (no se creó ninguna sesión)', () => {
    expect(() =>
      RegistroActividad.crear({
        ...BASE,
        accion: 'SESION_FALLIDA',
        idEntidad: null,
      }),
    ).not.toThrow();
  });

  it('rechaza una acción fuera del catálogo', () => {
    expect(campoInvalido({ ...BASE, accion: 'BORRAR_TODO' as never })).toBe(
      'accion',
    );
  });

  it('rechaza una entidad desconocida o que no corresponde a la acción', () => {
    expect(campoInvalido({ ...BASE, entidad: 'PRODUCTO' as never })).toBe(
      'entidad',
    );
    expect(campoInvalido({ ...BASE, entidad: 'USUARIO' })).toBe('entidad');
    expect(
      campoInvalido({
        ...BASE,
        accion: 'ACCESO_DENEGADO',
        entidad: 'SESION',
      }),
    ).toBe('entidad');
  });

  it('rechaza idEntidad sin entidad', () => {
    expect(
      campoInvalido({
        ...BASE,
        accion: 'ACCESO_DENEGADO',
        entidad: null,
        idEntidad: ID_SESION,
      }),
    ).toBe('idEntidad');
  });

  it('rechaza identificadores que no son UUID', () => {
    expect(campoInvalido({ ...BASE, id: 'x' })).toBe('id');
    expect(campoInvalido({ ...BASE, idUsuario: 'maria@correo.com' })).toBe(
      'idUsuario',
    );
    expect(campoInvalido({ ...BASE, idEntidad: '1' })).toBe('idEntidad');
  });

  it('rechaza una fecha inválida', () => {
    expect(campoInvalido({ ...BASE, fecha: new Date('x') })).toBe('fecha');
  });

  it('reconstituir conserva los datos leídos de la base', () => {
    const registro = RegistroActividad.reconstituir({
      ...BASE,
      detalle: { rol: 'CLIENTE' },
    });
    expect(registro.detalle).toEqual({ rol: 'CLIENTE' });
    expect(Object.isFrozen(registro.detalle)).toBe(true);
  });
});

describe('Catálogo de la bitácora (contrato de auditoría)', () => {
  it('cada acción tiene su entidad del contrato', () => {
    expect(Object.keys(ENTIDAD_DE_LA_ACCION).toSorted()).toEqual(
      [...ACCIONES_AUDITORIA].toSorted(),
    );
    expect(ENTIDAD_DE_LA_ACCION.ACCESO_DENEGADO).toBeNull();
    expect(ENTIDAD_DE_LA_ACCION.USUARIO_REGISTRADO).toBe('USUARIO');
    expect(ENTIDAD_DE_LA_ACCION.SESION_FALLIDA).toBe('SESION');
  });

  it('RF-USU-05: las cuatro acciones de recuperación y cambio de clave afectan a un USUARIO', () => {
    for (const accion of [
      'CODIGO_RECUPERACION_GENERADO',
      'CLAVE_RESTABLECIDA',
      'RECUPERACION_FALLIDA',
      'CLAVE_CAMBIADA',
    ] as const) {
      expect(ENTIDAD_DE_LA_ACCION[accion]).toBe('USUARIO');
    }
  });

  it('reconoce solo valores del catálogo', () => {
    expect(esAccionAuditoria('SESION_CERRADA')).toBe(true);
    expect(esAccionAuditoria('sesion_cerrada')).toBe(false);
    expect(esAccionAuditoria(1)).toBe(false);
    expect(esEntidadAuditoria('PEDIDO')).toBe(true);
    expect(esEntidadAuditoria('PRODUCTO')).toBe(false);
  });
});
