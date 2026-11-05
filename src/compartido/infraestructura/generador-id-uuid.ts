import { randomUUID } from 'node:crypto';
import type { GeneradorId } from '../aplicacion/generador-id.puerto.js';

/** UUID v4 aleatorio de Node (sin dependencias extra). */
export class GeneradorIdUuid implements GeneradorId {
  generar(): string {
    return randomUUID();
  }
}
