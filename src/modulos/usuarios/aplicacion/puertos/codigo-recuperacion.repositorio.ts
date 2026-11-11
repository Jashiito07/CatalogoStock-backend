import type { CodigoRecuperacion } from '../../dominio/codigo-recuperacion.js';

/** Puerto de persistencia de los códigos de recuperación (tabla `codigos_recuperacion`, RF-USU-05). */
export interface CodigoRecuperacionRepositorio {
  /**
   * Guarda `nuevo` e invalida (con `ahora`) cualquier código pendiente del
   * mismo Cliente, de forma atómica: dos generaciones simultáneas para el
   * mismo Cliente se ejecutan una después de otra y siempre queda un solo
   * código pendiente. Debe llamarse dentro de una `UnidadDeTrabajo`.
   */
  reemplazarPendientes(nuevo: CodigoRecuperacion, ahora: Date): Promise<void>;

  /**
   * Último código generado para el Cliente, **bloqueado** hasta el final de
   * la transacción en curso (`SELECT … FOR UPDATE`): dos recuperaciones
   * simultáneas con el mismo código no pueden usarlo las dos. Debe llamarse
   * dentro de una `UnidadDeTrabajo`.
   */
  buscarUltimoParaActualizar(
    idUsuario: string,
  ): Promise<CodigoRecuperacion | null>;

  /** Guarda el uso, la invalidación y los intentos fallidos del código. */
  guardar(codigo: CodigoRecuperacion): Promise<void>;

  /**
   * Vencimiento del código vigente de cada Cliente indicado (sin usar, sin
   * invalidar y sin vencer en `ahora`). Los Clientes sin código vigente no
   * aparecen en el resultado.
   */
  vencimientosVigentes(
    idsUsuarios: readonly string[],
    ahora: Date,
  ): Promise<ReadonlyMap<string, Date>>;
}

export const CODIGO_RECUPERACION_REPOSITORIO = Symbol(
  'CODIGO_RECUPERACION_REPOSITORIO',
);
