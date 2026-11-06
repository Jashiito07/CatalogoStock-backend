import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { FiltroErrores } from '../compartido/presentacion/filtro-errores.js';
import { crearValidationPipe } from '../compartido/presentacion/validacion.js';

export const PREFIJO_API = 'api/v1';

export interface OpcionesAplicacionHttp {
  /** Proxies de confianza delante de la API (`PROXY_SALTOS_CONFIABLES`). */
  saltosProxyConfiables?: number;
}

/**
 * Configuración HTTP común de la API. La usan `main.ts` y las pruebas e2e,
 * para que estas prueben exactamente lo mismo que se despliega.
 */
export function configurarAplicacionHttp(
  app: INestApplication,
  origenesCors: string[],
  opciones: OpcionesAplicacionHttp = {},
): void {
  // D-17: detrás de un proxy, el límite de intentos debe usar la IP real del
  // cliente. Solo se confía en `X-Forwarded-For` si se declaran proxies.
  const saltosProxy = opciones.saltosProxyConfiables ?? 0;
  if (saltosProxy > 0) {
    const express: { set(nombre: string, valor: number): void } = app
      .getHttpAdapter()
      .getInstance();
    express.set('trust proxy', saltosProxy);
  }
  app.setGlobalPrefix(PREFIJO_API);
  app.use(helmet());
  app.enableCors({
    origin: origenesCors,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(crearValidationPipe());
  app.useGlobalFilters(new FiltroErrores());
}
