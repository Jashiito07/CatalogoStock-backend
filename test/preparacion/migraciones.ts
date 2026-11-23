import type { DataSource } from 'typeorm';

/**
 * Revierte migraciones, de la más reciente hacia atrás, **hasta revertir** la
 * que se llama `nombre` (incluida). Así las pruebas de una migración no
 * dependen de cuántas se agreguen después de ella.
 */
export async function revertirHasta(
  fuente: DataSource,
  nombre: string,
): Promise<void> {
  for (let intentos = 0; intentos < 50; intentos++) {
    const [ultima] = await fuente.query<{ name: string }[]>(
      `SELECT name FROM migraciones ORDER BY id DESC LIMIT 1`,
    );
    if (ultima === undefined) {
      throw new Error(`La migración ${nombre} no estaba aplicada.`);
    }
    await fuente.undoLastMigration({ transaction: 'each' });
    if (ultima.name === nombre) {
      return;
    }
  }
  throw new Error(`No se pudo revertir hasta ${nombre}.`);
}
