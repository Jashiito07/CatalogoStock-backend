import {
  MENSAJE_CIUDAD_INVALIDA,
  MENSAJE_NOMBRE_COMERCIAL_INVALIDO,
  MENSAJE_PROVINCIA_INVALIDA,
  MENSAJE_WHATSAPP_INVALIDO,
  validarCiudad,
  validarNombreComercial,
  validarProvincia,
  validarWhatsapp,
} from '../../../dominio/perfil-vendedor.js';
import { CumpleReglaDominio } from './regla-dominio.js';

/**
 * Cuerpo de `PUT /api/v1/vendedor/perfil` (RF-USU-08): los cuatro campos son
 * obligatorios. Cada uno falla por separado con 400 `DATOS_INVALIDOS` sin
 * repetir el valor recibido; un campo no declarado también es 400.
 */
export class PerfilVendedorDto {
  @CumpleReglaDominio(validarNombreComercial, MENSAJE_NOMBRE_COMERCIAL_INVALIDO)
  nombreComercial: string;

  @CumpleReglaDominio(validarCiudad, MENSAJE_CIUDAD_INVALIDA)
  ciudad: string;

  @CumpleReglaDominio(validarProvincia, MENSAJE_PROVINCIA_INVALIDA)
  provincia: string;

  @CumpleReglaDominio(validarWhatsapp, MENSAJE_WHATSAPP_INVALIDO)
  whatsapp: string;
}
