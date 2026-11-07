import type { GeneradorId } from '../../../../compartido/aplicacion/generador-id.puerto.js';
import type { Reloj } from '../../../../compartido/aplicacion/reloj.puerto.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/unidad-trabajo.puerto.js';
import type { ServicioAuditoria } from '../../../auditoria/index.js';
import { validarFortalezaClave } from '../../dominio/clave.js';
import { Correo } from '../../dominio/correo.js';
import {
  CorreoYaRegistradoError,
  VendedorYaExisteError,
} from '../../dominio/errores-usuario.js';
import { NombreUsuario } from '../../dominio/nombre-usuario.js';
import { Telefono } from '../../dominio/telefono.js';
import { Usuario } from '../../dominio/usuario.js';
import type { GeneradorHash } from '../puertos/generador-hash.puerto.js';
import type { UsuarioRepositorio } from '../puertos/usuario.repositorio.js';

/** Datos del Vendedor tal como llegan del entorno; se validan aquí. */
export interface DatosCrearVendedor {
  nombre: string;
  correo: string;
  telefono: string;
  clave: string;
}

export type ResultadoCrearVendedor =
  | { creado: true; idUsuario: string }
  | { creado: false; motivo: 'VENDEDOR_EXISTENTE' };

/**
 * Crea la cuenta del único Vendedor (D-07, PA-09, RF-USU-02).
 *
 * - Si ya existe **algún** Vendedor, termina sin cambios (es idempotente).
 *   La base lo garantiza también ante ejecuciones simultáneas (D-21).
 * - Valida nombre, correo, teléfono (D-14) y la fortaleza de la clave con las
 *   mismas reglas que el registro del Cliente.
 * - Guarda solo el hash de la clave, nunca la clave (RNF-02).
 * - Registra `VENDEDOR_CREADO` (`origen: COMANDO_SEMILLA`) en la bitácora, en
 *   la misma transacción que la cuenta (RF-USU-04).
 *
 * No conoce HTTP, la CLI ni TypeORM: depende solo de sus puertos.
 */
export class CrearVendedorCasoUso {
  constructor(
    private readonly usuarios: UsuarioRepositorio,
    private readonly generadorHash: GeneradorHash,
    private readonly generadorId: GeneradorId,
    private readonly reloj: Reloj,
    private readonly unidadTrabajo: UnidadDeTrabajo,
    private readonly auditoria: ServicioAuditoria,
  ) {}

  async ejecutar(datos: DatosCrearVendedor): Promise<ResultadoCrearVendedor> {
    // PA-09: un solo Vendedor en la primera versión.
    if (await this.usuarios.existeConRol('VENDEDOR')) {
      return { creado: false, motivo: 'VENDEDOR_EXISTENTE' };
    }

    const nombre = NombreUsuario.crear(datos.nombre);
    const correo = Correo.crear(datos.correo);
    const telefono = Telefono.crear(datos.telefono);
    const clave = validarFortalezaClave(datos.clave);

    if (await this.usuarios.buscarPorCorreo(correo)) {
      throw new CorreoYaRegistradoError();
    }

    const vendedor = Usuario.crearVendedor({
      id: this.generadorId.generar(),
      nombre,
      correo,
      telefono,
      hashClave: await this.generadorHash.generar(clave),
      ahora: this.reloj.ahora(),
    });

    try {
      // RF-USU-04: el Vendedor y su `VENDEDOR_CREADO` se guardan juntos o
      // ninguno (contrato de auditoría).
      await this.unidadTrabajo.ejecutar(async () => {
        await this.usuarios.crear(vendedor);
        await this.auditoria.registrar({
          accion: 'VENDEDOR_CREADO',
          idUsuario: vendedor.id,
          entidad: 'USUARIO',
          idEntidad: vendedor.id,
          detalle: { origen: 'COMANDO_SEMILLA' },
        });
      });
    } catch (error) {
      // D-21: otra ejecución creó el Vendedor entre la comprobación y la
      // inserción; la base lo rechazó, la transacción se deshizo y el
      // resultado es «sin cambios». Se captura fuera de la transacción: tras
      // el error, PostgreSQL ya no admite más órdenes en ella.
      if (error instanceof VendedorYaExisteError) {
        return { creado: false, motivo: 'VENDEDOR_EXISTENTE' };
      }
      throw error;
    }

    return { creado: true, idUsuario: vendedor.id };
  }
}
