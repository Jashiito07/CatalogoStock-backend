/**
 * Catálogo cerrado de la bitácora (contrato de auditoría, RF-USU-04).
 * TypeScript puro. Las fases siguientes agregan acciones actualizando primero
 * `docs/contrato-api/auditoria.md` y después este archivo y su migración.
 */
export const ACCIONES_AUDITORIA = [
  'USUARIO_REGISTRADO',
  'VENDEDOR_CREADO',
  'SESION_INICIADA',
  'SESION_FALLIDA',
  'SESION_CERRADA',
  'SESION_REUTILIZACION_DETECTADA',
  'ACCESO_DENEGADO',
  // F1+: recuperación y cambio de clave (RF-USU-05, D-35, D-39). Migración
  // AgregarAccionesRecuperacionAuditoria.
  'CODIGO_RECUPERACION_GENERADO',
  'CLAVE_RESTABLECIDA',
  'RECUPERACION_FALLIDA',
  'CLAVE_CAMBIADA',
  // F2: marcas, productos e imágenes (contrato de productos). Migración
  // AgregarAccionesCatalogoAuditoria.
  'MARCA_CREADA',
  'MARCA_ACTUALIZADA',
  'PRODUCTO_CREADO',
  'PRODUCTO_ACTUALIZADO',
  'PRODUCTO_ELIMINADO',
  'IMAGEN_AGREGADA',
  'IMAGEN_ELIMINADA',
  // F6/F7: su `detalle` se define en esas fases (CA-03).
  'PAGO_VERIFICADO',
  'PEDIDO_ESTADO_CAMBIADO',
] as const;

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

/** Tipos de objeto afectado. */
export const ENTIDADES_AUDITORIA = [
  'USUARIO',
  'SESION',
  'MARCA',
  'PRODUCTO',
  'PEDIDO',
  'PAGO',
] as const;

export type EntidadAuditoria = (typeof ENTIDADES_AUDITORIA)[number];

/**
 * Entidad que corresponde a cada acción según la tabla del contrato
 * (`null`: la acción no afecta a un objeto, como `ACCESO_DENEGADO`).
 */
export const ENTIDAD_DE_LA_ACCION: Readonly<
  Record<AccionAuditoria, EntidadAuditoria | null>
> = {
  USUARIO_REGISTRADO: 'USUARIO',
  VENDEDOR_CREADO: 'USUARIO',
  SESION_INICIADA: 'SESION',
  SESION_FALLIDA: 'SESION',
  SESION_CERRADA: 'SESION',
  SESION_REUTILIZACION_DETECTADA: 'SESION',
  ACCESO_DENEGADO: null,
  CODIGO_RECUPERACION_GENERADO: 'USUARIO',
  CLAVE_RESTABLECIDA: 'USUARIO',
  RECUPERACION_FALLIDA: 'USUARIO',
  CLAVE_CAMBIADA: 'USUARIO',
  MARCA_CREADA: 'MARCA',
  MARCA_ACTUALIZADA: 'MARCA',
  PRODUCTO_CREADO: 'PRODUCTO',
  PRODUCTO_ACTUALIZADO: 'PRODUCTO',
  PRODUCTO_ELIMINADO: 'PRODUCTO',
  IMAGEN_AGREGADA: 'PRODUCTO',
  IMAGEN_ELIMINADA: 'PRODUCTO',
  PAGO_VERIFICADO: 'PAGO',
  PEDIDO_ESTADO_CAMBIADO: 'PEDIDO',
};

export function esAccionAuditoria(valor: unknown): valor is AccionAuditoria {
  return (
    typeof valor === 'string' &&
    (ACCIONES_AUDITORIA as readonly string[]).includes(valor)
  );
}

export function esEntidadAuditoria(valor: unknown): valor is EntidadAuditoria {
  return (
    typeof valor === 'string' &&
    (ENTIDADES_AUDITORIA as readonly string[]).includes(valor)
  );
}
