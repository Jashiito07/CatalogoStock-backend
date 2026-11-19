/** Estados de una importación (D-57): la más reciente de su marca está `VIGENTE`; las anteriores, `ARCHIVADA`. */
export const ESTADOS_IMPORTACION = ['VIGENTE', 'ARCHIVADA'] as const;

export type EstadoImportacion = (typeof ESTADOS_IMPORTACION)[number];

export function esEstadoImportacion(valor: unknown): valor is EstadoImportacion {
  return (
    typeof valor === 'string' &&
    (ESTADOS_IMPORTACION as readonly string[]).includes(valor)
  );
}

/** Una importación archivada se elimina sola 6 meses calendario después de archivarse (D-57). */
export const MESES_RETENCION = 6;

/**
 * Suma meses **calendario** a una fecha, en UTC: conserva el día y la hora
 * (`17 may 10:00` + 6 = `17 nov 10:00`) y, si el mes de destino no tiene ese
 * día, usa el último del mes (`31 ago` + 6 = `28 feb`). Es la misma regla que
 * `+ interval 'n months'` de PostgreSQL.
 */
export function sumarMesesCalendario(fecha: Date, meses: number): Date {
  const mesDestino = fecha.getUTCMonth() + meses;
  const diasDelMes = new Date(
    Date.UTC(fecha.getUTCFullYear(), mesDestino + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      fecha.getUTCFullYear(),
      mesDestino,
      Math.min(fecha.getUTCDate(), diasDelMes),
      fecha.getUTCHours(),
      fecha.getUTCMinutes(),
      fecha.getUTCSeconds(),
      fecha.getUTCMilliseconds(),
    ),
  );
}

/** Conteos de los borradores de una importación por estado (contrato de importación, «Importación»). */
export interface TotalesBorradores {
  pendientes: number;
  aprobados: number;
  descartados: number;
  /** Pendientes con alguna advertencia que pide revisión (sin contar las informativas). */
  conAdvertencias: number;
}

/**
 * Totales de una importación (contrato de importación, «Importación»; D-57).
 * `actualizaran + nuevos = pendientes`.
 */
export interface TotalesImportacion extends TotalesBorradores {
  /** Pendientes cuyo código ya tiene un producto en la marca: al aprobarlos se actualiza su precio. */
  actualizaran: number;
  /** Pendientes que al aprobarlos crean un producto (sin código o con código nuevo). */
  nuevos: number;
  /**
   * Productos de la marca con código que no aparecen en los borradores de esta
   * importación; solo se calcula en la `VIGENTE` (en una archivada vale 0).
   */
  ausentes: number;
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
  estado: EstadoImportacion;
  /** Cuándo pasó a `ARCHIVADA`; `null` mientras esté `VIGENTE`. */
  archivadaEn: Date | null;
  creadaEn: Date;
}

export type DatosNuevaImportacion = Omit<
  DatosImportacion,
  'estado' | 'archivadaEn'
>;

/**
 * Importación del catálogo en PDF (RF-PRO-01, D-49, D-57). El PDF no se
 * guarda: solo su huella, para no procesar dos veces el mismo archivo. Cada
 * marca tiene a lo sumo una `VIGENTE`; al subir su catálogo nuevo, la anterior
 * se archiva y se elimina sola 6 meses calendario después. Inmutable.
 */
export class Importacion {
  private constructor(private readonly datos: DatosImportacion) {}

  /** Importación nueva: siempre `VIGENTE`. */
  static crear(datos: DatosNuevaImportacion): Importacion {
    return new Importacion({ ...datos, estado: 'VIGENTE', archivadaEn: null });
  }

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
  get estado(): EstadoImportacion {
    return this.datos.estado;
  }
  get archivadaEn(): Date | null {
    return this.datos.archivadaEn;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }

  get estaArchivada(): boolean {
    return this.datos.estado === 'ARCHIVADA';
  }

  /** `archivadaEn` + 6 meses calendario; `null` si sigue `VIGENTE` (la vigente nunca se elimina sola). */
  get eliminaEn(): Date | null {
    return this.datos.archivadaEn === null
      ? null
      : sumarMesesCalendario(this.datos.archivadaEn, MESES_RETENCION);
  }

  /** La misma importación `ARCHIVADA` desde `ahora` (la retención de 6 meses cuenta desde aquí). */
  archivar(ahora: Date): Importacion {
    return new Importacion({
      ...this.datos,
      estado: 'ARCHIVADA',
      archivadaEn: ahora,
    });
  }

  /** `true` si es archivada y ya se cumplieron los 6 meses calendario (D-57). */
  estaVencida(ahora: Date): boolean {
    const eliminaEn = this.eliminaEn;
    return eliminaEn !== null && ahora.getTime() >= eliminaEn.getTime();
  }
}
