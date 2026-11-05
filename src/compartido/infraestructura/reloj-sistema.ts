import type { Reloj } from '../aplicacion/reloj.puerto.js';

/** Reloj real del servidor. */
export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}
