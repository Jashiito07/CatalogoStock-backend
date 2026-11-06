import { Sesion, SesionNoVigenteError } from './sesion.js';

const AHORA = new Date('2026-11-05T15:00:00.000Z');
const UN_DIA = 24 * 60 * 60 * 1000;

function nuevaSesion(): Sesion {
  return Sesion.iniciar({
    id: 'sesion-1',
    idUsuario: 'usuario-1',
    familia: 'familia-1',
    canal: 'APP',
    hashToken: 'hash-1',
    ahora: AHORA,
    vidaDias: 7,
  });
}

function despuesDe(milisegundos: number): Date {
  return new Date(AHORA.getTime() + milisegundos);
}

describe('D-09: dominio de la sesión (token de renovación)', () => {
  it('una sesión nueva está vigente y vence 7 días después de emitida', () => {
    const sesion = nuevaSesion();

    expect(sesion.estadoEn(AHORA)).toBe('VIGENTE');
    expect(sesion.venceEn).toEqual(despuesDe(7 * UN_DIA));
    expect(sesion.revocadaEn).toBeNull();
    expect(sesion.motivoRevocacion).toBeNull();
    expect(sesion.canal).toBe('APP');
  });

  it('justo al cumplir 7 días queda VENCIDA', () => {
    const sesion = nuevaSesion();

    expect(sesion.estadoEn(despuesDe(7 * UN_DIA - 1))).toBe('VIGENTE');
    expect(sesion.estadoEn(despuesDe(7 * UN_DIA))).toBe('VENCIDA');
  });

  it('rotar revoca la sesión como ROTADA y crea la siguiente con el mismo usuario, canal y familia', () => {
    const sesion = nuevaSesion();
    const momento = despuesDe(UN_DIA);

    const siguiente = sesion.rotar({
      id: 'sesion-2',
      hashToken: 'hash-2',
      ahora: momento,
      vidaDias: 7,
    });

    expect(sesion.estadoEn(momento)).toBe('REVOCADA');
    expect(sesion.motivoRevocacion).toBe('ROTADA');
    expect(sesion.fueRotada()).toBe(true);
    expect(siguiente.estadoEn(momento)).toBe('VIGENTE');
    expect(siguiente.idUsuario).toBe('usuario-1');
    expect(siguiente.canal).toBe('APP');
    expect(siguiente.familia).toBe('familia-1');
    // Cada token nuevo vence 7 días después de su emisión (contrato de usuarios).
    expect(siguiente.venceEn).toEqual(despuesDe(8 * UN_DIA));
  });

  it('un token ya rotado no se puede rotar otra vez (un solo uso)', () => {
    const sesion = nuevaSesion();
    sesion.rotar({ id: 's2', hashToken: 'h2', ahora: AHORA, vidaDias: 7 });

    expect(() =>
      sesion.rotar({ id: 's3', hashToken: 'h3', ahora: AHORA, vidaDias: 7 }),
    ).toThrow(SesionNoVigenteError);
  });

  it('una sesión vencida no se puede rotar', () => {
    const sesion = nuevaSesion();

    expect(() =>
      sesion.rotar({
        id: 's2',
        hashToken: 'h2',
        ahora: despuesDe(8 * UN_DIA),
        vidaDias: 7,
      }),
    ).toThrow('VENCIDA');
  });

  it('la revocación tiene prioridad sobre el vencimiento', () => {
    const sesion = Sesion.reconstituir({
      ...nuevaSesion().toJSON(),
      hashToken: 'hash-1',
      revocadaEn: AHORA,
      motivoRevocacion: 'CERRADA',
    });

    expect(sesion.estadoEn(despuesDe(30 * UN_DIA))).toBe('REVOCADA');
    expect(sesion.fueRotada()).toBe(false);
  });

  it('perteneceA compara el usuario dueño', () => {
    expect(nuevaSesion().perteneceA('usuario-1')).toBe(true);
    expect(nuevaSesion().perteneceA('otro')).toBe(false);
  });

  it('al serializarla no expone el hash del token', () => {
    const texto = JSON.stringify(nuevaSesion());

    expect(texto).not.toContain('hash-1');
    expect(texto).toContain('familia-1');
  });

  it.each([0, -1, 1.5])('rechaza una vida de %s días', (vidaDias) => {
    expect(() =>
      Sesion.iniciar({
        id: 's',
        idUsuario: 'u',
        familia: 'f',
        canal: 'PANEL',
        hashToken: 'h',
        ahora: AHORA,
        vidaDias,
      }),
    ).toThrow('entero positivo');
  });

  it('rechaza una sesión sin hash del token', () => {
    expect(() =>
      Sesion.reconstituir({ ...nuevaSesion().toJSON(), hashToken: '' }),
    ).toThrow('hash');
  });

  it('rechaza fecha de revocación sin motivo', () => {
    expect(() =>
      Sesion.reconstituir({
        ...nuevaSesion().toJSON(),
        hashToken: 'h',
        revocadaEn: AHORA,
        motivoRevocacion: null,
      }),
    ).toThrow('revocación');
  });

  it('rechaza un vencimiento anterior a la creación', () => {
    expect(() =>
      Sesion.reconstituir({
        ...nuevaSesion().toJSON(),
        hashToken: 'h',
        venceEn: AHORA,
      }),
    ).toThrow('vencer');
  });
});
