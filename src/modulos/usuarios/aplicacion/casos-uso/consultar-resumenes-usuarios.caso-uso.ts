import type { Rol } from '../../dominio/rol.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/** Datos mínimos de un usuario para mostrarlo en otros módulos (nunca correo, teléfono ni clave). */
export interface ResumenUsuario {
  id: string;
  nombre: string;
  rol: Rol;
}

/** Máximo de ids por llamada: los de una página de la bitácora (`tamanio` ≤ 100). */
export const MAXIMO_IDS_RESUMEN = 100;

/**
 * Servicio público de `usuarios` para los demás módulos (por ejemplo, la
 * bitácora muestra `{ id, nombre, rol }` al consultar, RF-USU-04). Los demás
 * módulos no leen la tabla `usuarios`. Los ids que no existen se omiten.
 */
export class ConsultarResumenesUsuariosCasoUso {
  constructor(private readonly usuarios: UsuarioRepositorio) {}

  async ejecutar(ids: readonly string[]): Promise<ResumenUsuario[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) {
      return [];
    }
    if (unicos.length > MAXIMO_IDS_RESUMEN) {
      throw new RangeError(
        `Se pidieron más de ${MAXIMO_IDS_RESUMEN} usuarios a la vez.`,
      );
    }
    const encontrados = await this.usuarios.buscarPorIds(unicos);
    return encontrados.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre.valor,
      rol: usuario.rol,
    }));
  }
}
