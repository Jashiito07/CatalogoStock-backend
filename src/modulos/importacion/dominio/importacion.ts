/** Totales de una importación (contrato de importación, «Importación»). */
export interface TotalesImportacion {
  pendientes: number;
  aprobados: number;
  descartados: number;
  /** Pendientes con alguna advertencia que pide revisión (sin contar la informativa). */
  conAdvertencias: number;
}

export interface DatosImportacion {
  id: string;
  /** Solo informativo; ya saneado (sin rutas). */
  nombreArchivo: string;
  /** SHA-256 del PDF en hexadecimal (64 caracteres): idempotencia. */
  huella: string;
  /** Marca a la que se asignan los borradores por defecto. */
  marcaId: string;
  paginas: number;
  creadaEn: Date;
}

/**
 * Importación del catálogo en PDF (RF-PRO-01, D-49). El PDF no se guarda: solo
 * su huella, para no procesar dos veces el mismo archivo. Inmutable.
 */
export class Importacion {
  private constructor(private readonly datos: DatosImportacion) {}

  static reconstituir(datos: DatosImportacion): Importacion {
    return new Importacion({ ...datos });
  }

  get id(): string {
    return this.datos.id;
  }
  get nombreArchivo(): string {
    return this.datos.nombreArchivo;
  }
  get huella(): string {
    return this.datos.huella;
  }
  get marcaId(): string {
    return this.datos.marcaId;
  }
  get paginas(): number {
    return this.datos.paginas;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
}
