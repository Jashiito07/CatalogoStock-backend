import { JwtService } from '@nestjs/jwt';
import {
  TokenAccesoAusenteError,
  TokenAccesoVencidoError,
} from '../../dominio/errores-autenticacion.js';
import { EmisorTokenAccesoJwt } from './emisor-token-acceso.jwt.js';

const SECRETO = 'secreto_de_pruebas_unitarias_con_mas_de_32_caracteres';

function crearJwt(secreto = SECRETO): JwtService {
  return new JwtService({
    secret: secreto,
    signOptions: { algorithm: 'HS256' },
    verifyOptions: { algorithms: ['HS256'] },
  });
}

describe('D-09: EmisorTokenAccesoJwt (JWT de acceso de 15 minutos)', () => {
  const emisor = new EmisorTokenAccesoJwt(crearJwt(), 900);

  it('emite un JWT con sub, rol, iat y exp = iat + 900 y lo verifica', async () => {
    const ahora = new Date();

    const { token, venceEn } = await emisor.emitir(
      { idUsuario: 'id-1', rol: 'CLIENTE' },
      ahora,
    );

    const contenido = crearJwt().decode<Record<string, unknown>>(token);
    const iat = Math.floor(ahora.getTime() / 1000);
    expect(contenido).toEqual({
      sub: 'id-1',
      rol: 'CLIENTE',
      iat,
      exp: iat + 900,
    });
    expect(venceEn).toEqual(new Date((iat + 900) * 1000));
    await expect(emisor.verificar(token)).resolves.toEqual({
      idUsuario: 'id-1',
      rol: 'CLIENTE',
    });
  });

  it('un token vencido → TOKEN_VENCIDO', async () => {
    const haceUnaHora = new Date(Date.now() - 3600_000);
    const { token } = await emisor.emitir(
      { idUsuario: 'id-1', rol: 'CLIENTE' },
      haceUnaHora,
    );

    await expect(emisor.verificar(token)).rejects.toBeInstanceOf(
      TokenAccesoVencidoError,
    );
    await expect(emisor.verificar(token)).rejects.toMatchObject({
      codigo: 'TOKEN_VENCIDO',
    });
  });

  it('un token firmado con otro secreto → NO_AUTENTICADO', async () => {
    const otro = new EmisorTokenAccesoJwt(
      crearJwt('otro_secreto_distinto_de_32_caracteres_o_mas'),
      900,
    );
    const { token } = await otro.emitir(
      { idUsuario: 'id-1', rol: 'VENDEDOR' },
      new Date(),
    );

    await expect(emisor.verificar(token)).rejects.toBeInstanceOf(
      TokenAccesoAusenteError,
    );
  });

  it('un token alterado (rol cambiado sin firmar) → NO_AUTENTICADO', async () => {
    const { token } = await emisor.emitir(
      { idUsuario: 'id-1', rol: 'CLIENTE' },
      new Date(),
    );
    const [cabecera, , firma] = token.split('.');
    const contenido = Buffer.from(
      JSON.stringify({
        sub: 'id-1',
        rol: 'VENDEDOR',
        iat: 1,
        exp: 9_999_999_999,
      }),
    ).toString('base64url');

    await expect(
      emisor.verificar(`${cabecera}.${contenido}.${firma}`),
    ).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });

  it('rechaza tokens con alg "none"', async () => {
    const cabecera = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    const contenido = Buffer.from(
      JSON.stringify({ sub: 'id-1', rol: 'VENDEDOR', exp: 9_999_999_999 }),
    ).toString('base64url');

    await expect(
      emisor.verificar(`${cabecera}.${contenido}.`),
    ).rejects.toBeInstanceOf(TokenAccesoAusenteError);
  });

  it('rechaza un token bien firmado pero sin rol válido', async () => {
    const token = await crearJwt().signAsync(
      { sub: 'id-1', rol: 'ADMIN' },
      { expiresIn: 60 },
    );

    await expect(emisor.verificar(token)).rejects.toBeInstanceOf(
      TokenAccesoAusenteError,
    );
  });

  it('rechaza texto que no es un JWT', async () => {
    await expect(emisor.verificar('basura')).rejects.toBeInstanceOf(
      TokenAccesoAusenteError,
    );
  });
});
