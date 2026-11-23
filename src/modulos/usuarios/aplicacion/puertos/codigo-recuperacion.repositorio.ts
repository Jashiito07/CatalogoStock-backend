import type {
  CodigoRecuperacion,
  PropositoCodigo,
} from '../../dominio/codigo-recuperacion.js';

/** Límite de códigos emitidos a una misma cuenta y propósito (contrato de correo, D-17). */
export interface LimiteEmision {
  /** Solo cuentan los códigos creados **después** de este momento (un código de justo una hora atrás ya no cuenta). */
  desde: Date;
  /** Cantidad máxima de códigos en esa ventana. */
  maximo: number;
}

export type ResultadoEmision =
  | { emitido: true }
  /** El límite ya se alcanzó: no se guardó nada. `disponibleEn`: cuándo se libera un envío. */
  | { emitido: false; disponibleEn: Date };

/** Puerto de persistencia de los códigos de recuperación (tabla `codigos_recuperacion`, RF-USU-05). */
export interface CodigoRecuperacionRepositorio {
  /**
   * Guarda `nuevo` e invalida (con `ahora`) cualquier código pendiente del
   * mismo usuario y del mismo grupo de propósitos (`propositosDelGrupo`), de
   * forma atómica: dos emisiones simultáneas para el mismo usuario se ejecutan
   * una después de otra y siempre queda un solo código pendiente por grupo.
   *
   * Con `limite`, antes de guardar cuenta (con el usuario ya bloqueado, para
   * que dos solicitudes simultáneas no se salten el límite) los códigos del
   * mismo usuario y **mismo propósito** creados desde `limite.desde`; si ya
   * hay `limite.maximo`, no guarda nada y devuelve `emitido: false`.
   * Debe llamarse dentro de una `UnidadDeTrabajo`.
   */
  emitir(
    nuevo: CodigoRecuperacion,
    ahora: Date,
    limite?: LimiteEmision,
  ): Promise<ResultadoEmision>;

  /**
   * Último código generado para el usuario con alguno de esos propósitos,
   * **bloqueado** hasta el final de la transacción en curso
   * (`SELECT … FOR UPDATE`): dos recuperaciones simultáneas con el mismo
   * código no pueden usarlo las dos. Debe llamarse dentro de una `UnidadDeTrabajo`.
   */
  buscarUltimoParaActualizar(
    idUsuario: string,
    propositos: readonly PropositoCodigo[],
  ): Promise<CodigoRecuperacion | null>;

  /** Guarda el uso, la invalidación y los intentos fallidos del código. */
  guardar(codigo: CodigoRecuperacion): Promise<void>;

  /**
   * Borra **todos** los códigos del usuario, de cualquier propósito (RF-USU-06:
   * al eliminar la cuenta no queda ningún código pendiente). Dentro de la
   * transacción en curso si la hay. Devuelve cuántos borró.
   */
  eliminarDeUsuario(idUsuario: string): Promise<number>;

  /**
   * Vencimiento del código de **recuperación asistida** vigente de cada
   * Cliente indicado (sin usar, sin invalidar y sin vencer en `ahora`), para
   * la sección «Clientes» del panel. Los Clientes sin código vigente no
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
