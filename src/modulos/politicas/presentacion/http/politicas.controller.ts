import { createHash } from 'node:crypto';
import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Publico } from '../../../../compartido/presentacion/publico.js';
import {
  ConsultarPoliticasCasoUso,
  type ResumenPoliticas,
} from '../../aplicacion/consultar-politicas.caso-uso.js';
import {
  ESTILOS_POLITICAS,
  paginaEliminarCuenta,
  paginaPrivacidad,
  paginaTerminos,
  SCRIPT_ELIMINAR_CUENTA,
} from '../../dominio/documentos-politicas.js';

const hashEstilos = createHash('sha256')
  .update(ESTILOS_POLITICAS)
  .digest('base64');

/**
 * Política estricta de las páginas (RF-USU-07): nada se carga de terceros;
 * los estilos se autorizan por su hash y el único script es un archivo propio
 * del mismo origen (sin scripts en línea). `connect-src 'self'` deja al
 * formulario llamar a la API; no hay formularios nativos ni marcos.
 */
const CSP_PAGINAS = [
  `default-src 'none'`,
  `style-src 'sha256-${hashEstilos}'`,
  `script-src 'self'`,
  `connect-src 'self'`,
  `base-uri 'none'`,
  `form-action 'none'`,
  `frame-ancestors 'none'`,
].join('; ');

const CSP_SCRIPT = `default-src 'none'`;
const CACHE_CORTO = 'public, max-age=300';

/**
 * Políticas públicas (RF-USU-07), sin sesión y sin datos personales.
 * `GET /api/v1/politicas` devuelve las versiones y direcciones; las páginas HTML
 * se sirven **fuera** del prefijo `/api/v1` (ver `configurarAplicacionHttp`):
 * `/politicas/privacidad`, `/politicas/terminos` y `/politicas/eliminar-cuenta`.
 */
@Controller('politicas')
@Publico()
export class PoliticasController {
  constructor(
    @Inject(ConsultarPoliticasCasoUso)
    private readonly consultar: ConsultarPoliticasCasoUso,
  ) {}

  @Get()
  resumen(): ResumenPoliticas {
    return this.consultar.ejecutar();
  }

  @Get('privacidad')
  privacidad(@Res() respuesta: Response): void {
    this.html(respuesta, paginaPrivacidad());
  }

  @Get('terminos')
  terminos(@Res() respuesta: Response): void {
    this.html(respuesta, paginaTerminos());
  }

  @Get('eliminar-cuenta')
  eliminarCuenta(@Res() respuesta: Response): void {
    this.html(respuesta, paginaEliminarCuenta());
  }

  /** Script del formulario de eliminar cuenta: archivo propio del mismo origen. */
  @Get('eliminar-cuenta.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', CACHE_CORTO)
  @Header('Content-Security-Policy', CSP_SCRIPT)
  scriptEliminarCuenta(): string {
    return SCRIPT_ELIMINAR_CUENTA;
  }

  private html(respuesta: Response, contenido: string): void {
    respuesta
      .status(200)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE_CORTO,
        'Content-Security-Policy': CSP_PAGINAS,
      })
      .send(contenido);
  }
}
