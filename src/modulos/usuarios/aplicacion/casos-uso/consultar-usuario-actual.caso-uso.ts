import { TokenAccesoAusenteError } from '../../dominio/errores-autenticacion.js';
import type { UsuarioPublico } from '../../dominio/usuario.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/**
 * `GET /usuarios/yo` (RF-USU-01, RF-USU-02): devuelve los datos públicos del
 * usuario del token, nunca los de otro (propiedad: no recibe un id externo).
 *
 * Si la cuenta ya no existe o está inactiva, responde 401 `NO_AUTENTICADO`
 * (uno de los errores del contrato para esta ruta), igual que la renovación
 * rechaza una cuenta inactiva: el token sigue siendo válido hasta vencer,
 * pero la cuenta ya no lo es.
 */
export class ConsultarUsuarioActualCasoUso {
  constructor(private readonly usuarios: UsuarioRepositorio) {}

  async ejecutar(idUsuario: string): Promise<UsuarioPublico> {
    const usuario = await this.usuarios.buscarPorId(idUsuario);
    if (!usuario?.activo) {
      throw new TokenAccesoAusenteError();
    }
    return usuario.aPublico();
  }
}
