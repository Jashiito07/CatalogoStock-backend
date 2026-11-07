import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConflictoError,
  DatosInvalidosError,
  NoAutenticadoError,
  NoAutorizadoError,
  NoEncontradoError,
  ReglaNegocioError,
} from '../dominio/errores.js';
import { FiltroErrores } from './filtro-errores.js';

describe('FiltroErrores: formato { codigo, mensaje, detalles } del contrato', () => {
  const filtro = new FiltroErrores();

  describe('errores de dominio', () => {
    it.each([
      [
        new DatosInvalidosError('Monto inválido', { campo: 'total' }),
        400,
        'DATOS_INVALIDOS',
      ],
      [new NoEncontradoError('Pedido no encontrado'), 404, 'NO_ENCONTRADO'],
      [new NoAutorizadoError(), 403, 'NO_AUTORIZADO'],
      [
        new NoAutenticadoError(
          'CREDENCIALES_INVALIDAS',
          'Correo o clave incorrectos.',
        ),
        401,
        'CREDENCIALES_INVALIDAS',
      ],
      [
        new ConflictoError('STOCK_INSUFICIENTE', 'Sin stock'),
        409,
        'STOCK_INSUFICIENTE',
      ],
      [
        new ReglaNegocioError(
          'TRANSICION_NO_PERMITIDA',
          'Transición no permitida',
        ),
        422,
        'TRANSICION_NO_PERMITIDA',
      ],
    ])('%s → %i %s', (error, estado, codigo) => {
      const resultado = filtro.resolver(error);
      expect(resultado.estado).toBe(estado);
      expect(resultado.cuerpo.codigo).toBe(codigo);
      expect(resultado.cuerpo.mensaje).toBe(error.message);
      expect(resultado.cuerpo.detalles).toEqual(error.detalles ?? {});
    });
  });

  describe('excepciones HTTP', () => {
    it.each([
      [new BadRequestException(), 400, 'DATOS_INVALIDOS'],
      [new UnauthorizedException(), 401, 'NO_AUTENTICADO'],
      [new ForbiddenException(), 403, 'NO_AUTORIZADO'],
      [new NotFoundException('Cannot GET /api/v1/x'), 404, 'NO_ENCONTRADO'],
      [new HttpException('Teapot', 418), 418, 'SOLICITUD_RECHAZADA'],
    ])('%s → %i %s con mensaje en español', (excepcion, estado, codigo) => {
      const resultado = filtro.resolver(excepcion);
      expect(resultado.estado).toBe(estado);
      expect(resultado.cuerpo.codigo).toBe(codigo);
      expect(resultado.cuerpo.mensaje).not.toMatch(/Cannot|Teapot|Bad Request/);
      expect(resultado.cuerpo.detalles).toEqual({});
    });

    it('respeta un cuerpo que ya trae codigo, mensaje y detalles', () => {
      const resultado = filtro.resolver(
        new BadRequestException({
          codigo: 'DATOS_INVALIDOS',
          mensaje: 'Los datos enviados no son válidos.',
          detalles: {
            errores: [{ campo: 'correo', errores: ['obligatorio'] }],
          },
        }),
      );
      expect(resultado).toEqual({
        estado: 400,
        cuerpo: {
          codigo: 'DATOS_INVALIDOS',
          mensaje: 'Los datos enviados no son válidos.',
          detalles: {
            errores: [{ campo: 'correo', errores: ['obligatorio'] }],
          },
        },
      });
    });

    it('un error 4xx de Express (JSON mal formado) responde 400 DATOS_INVALIDOS', () => {
      const errorExpress = Object.assign(new SyntaxError('Unexpected token'), {
        status: 400,
        expose: true,
        type: 'entity.parse.failed',
      });
      const resultado = filtro.resolver(errorExpress);
      expect(resultado.estado).toBe(400);
      expect(resultado.cuerpo.codigo).toBe('DATOS_INVALIDOS');
    });
  });

  describe('errores internos', () => {
    it.each([
      [new Error('password=secreto en host db.interna')],
      [new InternalServerErrorException('detalle interno de la BD')],
      ['un texto lanzado'],
      [undefined],
    ])('%s → 500 ERROR_INTERNO sin exponer detalles', (excepcion) => {
      const resultado = filtro.resolver(excepcion);
      expect(resultado.estado).toBe(500);
      expect(resultado.cuerpo.codigo).toBe('ERROR_INTERNO');
      expect(resultado.cuerpo.detalles).toEqual({});
      expect(JSON.stringify(resultado.cuerpo)).not.toMatch(
        /secreto|interna|interno de la BD|texto lanzado/,
      );
    });
  });
});
