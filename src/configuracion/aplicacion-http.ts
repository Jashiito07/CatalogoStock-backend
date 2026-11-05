import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { FiltroErrores } from '../compartido/presentacion/filtro-errores.js';
import { crearValidationPipe } from '../compartido/presentacion/validacion.js';

export const PREFIJO_API = 'api/v1';

/**
 * Configuración HTTP común de la API. La usan `main.ts` y las pruebas e2e,
 * para que estas prueben exactamente lo mismo que se despliega.
 */
export function configurarAplicacionHttp(
  app: INestApplication,
  origenesCors: string[],
): void {
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
