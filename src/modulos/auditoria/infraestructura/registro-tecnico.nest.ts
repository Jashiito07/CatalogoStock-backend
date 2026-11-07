import { Logger } from '@nestjs/common';
import type { RegistroTecnico } from '../aplicacion/puertos/registro-tecnico.puerto.js';

/** Log técnico de la bitácora con el Logger de NestJS. */
export class RegistroTecnicoNest implements RegistroTecnico {
  private readonly logger = new Logger('Auditoria');

  advertir(mensaje: string): void {
    this.logger.warn(mensaje);
  }

  error(mensaje: string): void {
    this.logger.error(mensaje);
  }
}
