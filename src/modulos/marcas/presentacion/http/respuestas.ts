import type { MarcaSugeridaConEstado } from '../../aplicacion/casos-uso/listar-marcas-sugeridas.caso-uso.js';
import type { MarcaPublica } from '../../dominio/marca.js';

/** Marca del contrato de productos («Modelo → Marca»). */
export interface RespuestaMarca {
  id: string;
  nombre: string;
  color: string;
  colorAcento: string | null;
  textoSobreColor: string;
  textoSobreAcento: string | null;
  activa: boolean;
  orden: number;
  creadaEn: string;
}

export interface RespuestaListaMarcas {
  elementos: RespuestaMarca[];
}

export interface RespuestaListaSugeridas {
  elementos: MarcaSugeridaConEstado[];
}

export function aRespuestaMarca(marca: MarcaPublica): RespuestaMarca {
  return {
    id: marca.id,
    nombre: marca.nombre,
    color: marca.color,
    colorAcento: marca.colorAcento,
    textoSobreColor: marca.textoSobreColor,
    textoSobreAcento: marca.textoSobreAcento,
    activa: marca.activa,
    orden: marca.orden,
    creadaEn: marca.creadaEn.toISOString(),
  };
}
