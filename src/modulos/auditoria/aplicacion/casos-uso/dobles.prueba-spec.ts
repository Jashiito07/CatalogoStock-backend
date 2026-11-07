/**
 * Dobles en memoria para las pruebas unitarias de la bitácora. El nombre
 * termina en `spec.ts` para que no se compile en `dist/`, pero no en
 * `.spec.ts`, para que Vitest no lo tome como archivo de pruebas.
 */
import {
  desplazamiento,
  type Paginacion,
} from '../../../../compartido/dominio/paginacion.js';
import type { FiltrosBitacora } from '../../dominio/filtros-bitacora.js';
import type { RegistroActividad } from '../../dominio/registro-actividad.js';
import type {
  DirectorioUsuarios,
  ResumenUsuarioBitacora,
} from '../puertos/directorio-usuarios.puerto.js';
import type {
  RegistroActividadRepositorio,
  ResultadoConsultaBitacora,
} from '../puertos/registro-actividad.repositorio.js';
import type { RegistroTecnico } from '../puertos/registro-tecnico.puerto.js';

export class RegistroActividadRepositorioEnMemoria implements RegistroActividadRepositorio {
  readonly registros: RegistroActividad[] = [];
  readonly fueraDeTransaccion: RegistroActividad[] = [];
  fallo: Error | undefined;
  ultimaConsulta:
    { filtros: FiltrosBitacora; paginacion: Paginacion } | undefined;

  guardar(registro: RegistroActividad): Promise<void> {
    if (this.fallo) {
      return Promise.reject(this.fallo);
    }
    this.registros.push(registro);
    return Promise.resolve();
  }

  guardarFueraDeTransaccion(registro: RegistroActividad): Promise<void> {
    if (this.fallo) {
      return Promise.reject(this.fallo);
    }
    this.fueraDeTransaccion.push(registro);
    this.registros.push(registro);
    return Promise.resolve();
  }

  consultar(
    filtros: FiltrosBitacora,
    paginacion: Paginacion,
  ): Promise<ResultadoConsultaBitacora> {
    this.ultimaConsulta = { filtros, paginacion };
    const ordenados = this.registros.toSorted(
      (a, b) => b.fecha.getTime() - a.fecha.getTime(),
    );
    const inicio = desplazamiento(paginacion);
    return Promise.resolve({
      registros: ordenados.slice(inicio, inicio + paginacion.tamanio),
      total: ordenados.length,
    });
  }
}

export class DirectorioUsuariosFalso implements DirectorioUsuarios {
  readonly consultas: (readonly string[])[] = [];

  constructor(private readonly usuarios: ResumenUsuarioBitacora[] = []) {}

  buscarResumenes(ids: readonly string[]): Promise<ResumenUsuarioBitacora[]> {
    this.consultas.push(ids);
    return Promise.resolve(this.usuarios.filter((u) => ids.includes(u.id)));
  }
}

export class RegistroTecnicoFalso implements RegistroTecnico {
  readonly advertencias: string[] = [];
  readonly errores: string[] = [];

  advertir(mensaje: string): void {
    this.advertencias.push(mensaje);
  }

  error(mensaje: string): void {
    this.errores.push(mensaje);
  }
}
