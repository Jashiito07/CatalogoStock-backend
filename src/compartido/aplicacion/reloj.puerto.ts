/** Puerto de reloj: permite fechas deterministas en las pruebas (backend-pruebas). */
export interface Reloj {
  ahora(): Date;
}

export const RELOJ = Symbol('RELOJ');
