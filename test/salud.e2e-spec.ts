import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import {
  RELOJ,
  type Reloj,
} from '../src/compartido/aplicacion/reloj.puerto.js';
import { configurarAplicacionHttp } from '../src/configuracion/aplicacion-http.js';
import { ConexionBaseDatosServicio } from '../src/configuracion/conexion-base-datos.servicio.js';
import {
  COMPROBADOR_BASE_DATOS,
  type ComprobadorBaseDatos,
} from '../src/modulos/salud/aplicacion/puertos/comprobador-base-datos.puerto.js';

/**
 * e2e de GET /api/v1/salud SIN PostgreSQL: el puerto de la BD se sustituye por
 * uno falso y el servicio de conexión por uno que no conecta.
 * Las variables de entorno falsas vienen de vitest.config.e2e.ts.
 */
class ComprobadorFalso implements ComprobadorBaseDatos {
  disponible = true;

  estaDisponible(): Promise<boolean> {
    return Promise.resolve(this.disponible);
  }
}

const FECHA_FIJA = new Date('2026-11-04T20:00:00.000Z');
const ORIGEN_PERMITIDO = 'http://localhost:4200';

describe('PLAN F0: GET /api/v1/salud (e2e)', () => {
  let app: INestApplication<App>;
  const comprobador = new ComprobadorFalso();

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(COMPROBADOR_BASE_DATOS)
      .useValue(comprobador)
      .overrideProvider(RELOJ)
      .useValue({ ahora: () => FECHA_FIJA } satisfies Reloj)
      .overrideProvider(ConexionBaseDatosServicio)
      .useValue({})
      .compile();

    app = modulo.createNestApplication();
    configurarAplicacionHttp(app, [ORIGEN_PERMITIDO]);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Dado que la BD responde, cuando se consulta /salud sin token, entonces 200 con baseDatos conectada', async () => {
    comprobador.disponible = true;

    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/salud')
      .expect(200);

    expect(respuesta.body).toEqual({
      estado: 'ok',
      baseDatos: 'conectada',
      fecha: '2026-11-04T20:00:00.000Z',
    });
  });

  it('Dado que la BD no responde, cuando se consulta /salud, entonces 200 con baseDatos desconectada', async () => {
    comprobador.disponible = false;

    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/salud')
      .expect(200);

    expect(respuesta.body).toMatchObject({
      estado: 'ok',
      baseDatos: 'desconectada',
    });
  });

  it('la ruta sin el prefijo /api/v1 no existe', async () => {
    await request(app.getHttpServer()).get('/salud').expect(404);
  });

  it('una ruta inexistente responde 404 con el formato de error del contrato', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/no-existe')
      .expect(404);

    expect(respuesta.body).toEqual({
      codigo: 'NO_ENCONTRADO',
      mensaje: 'El recurso solicitado no existe.',
      detalles: {},
    });
  });

  it('aplica cabeceras de seguridad de helmet', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/v1/salud');

    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS permite solo los orígenes configurados', async () => {
    const permitido = await request(app.getHttpServer())
      .get('/api/v1/salud')
      .set('Origin', ORIGEN_PERMITIDO);
    expect(permitido.headers['access-control-allow-origin']).toBe(
      ORIGEN_PERMITIDO,
    );

    const ajeno = await request(app.getHttpServer())
      .get('/api/v1/salud')
      .set('Origin', 'http://sitio-ajeno.test');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });
});
