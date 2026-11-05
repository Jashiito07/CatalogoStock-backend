/** Estado de la conexión con la base de datos central (PostgreSQL). */
export type EstadoBaseDatos = 'conectada' | 'desconectada';

/**
 * Estado de salud de la API. Si la API responde, `estado` es 'ok' aunque la
 * base de datos no esté disponible; eso se informa en `baseDatos`.
 */
export interface EstadoSalud {
  readonly estado: 'ok';
  readonly baseDatos: EstadoBaseDatos;
  readonly fecha: Date;
}

export function crearEstadoSalud(
  baseDatosDisponible: boolean,
  fecha: Date,
): EstadoSalud {
  return {
    estado: 'ok',
    baseDatos: baseDatosDisponible ? 'conectada' : 'desconectada',
    fecha,
  };
}
