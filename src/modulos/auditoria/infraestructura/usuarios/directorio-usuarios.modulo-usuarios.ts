import { ConsultarResumenesUsuariosCasoUso } from '../../../usuarios/index.js';
import type {
  DirectorioUsuarios,
  ResumenUsuarioBitacora,
} from '../../aplicacion/puertos/directorio-usuarios.puerto.js';

/**
 * Adaptador del puerto DirectorioUsuarios con el servicio público del módulo
 * `usuarios` (la bitácora nunca lee la tabla `usuarios`).
 */
export class DirectorioUsuariosModuloUsuarios implements DirectorioUsuarios {
  constructor(private readonly resumenes: ConsultarResumenesUsuariosCasoUso) {}

  buscarResumenes(ids: readonly string[]): Promise<ResumenUsuarioBitacora[]> {
    return this.resumenes.ejecutar(ids);
  }
}
