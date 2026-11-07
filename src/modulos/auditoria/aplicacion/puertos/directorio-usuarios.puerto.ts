/** Datos de un usuario que muestra la bitácora: `{ id, nombre, rol }`. */
export interface ResumenUsuarioBitacora {
  id: string;
  nombre: string;
  rol: string;
}

/**
 * Puerto para obtener el nombre y el rol de los usuarios **al consultar**
 * (contrato: el nombre no se copia en el registro). El adaptador usa el
 * servicio público del módulo `usuarios`; la bitácora no lee su tabla.
 */
export interface DirectorioUsuarios {
  buscarResumenes(ids: readonly string[]): Promise<ResumenUsuarioBitacora[]>;
}

export const DIRECTORIO_USUARIOS = Symbol('DIRECTORIO_USUARIOS');
