import { Dinero } from '../../../compartido/dominio/dinero.js';

/**
 * `"1,234.50"`, `"35,5"`, `"35"` → `"1234.50"`, `"35.50"`, `"35.00"`; `null`
 * si no es un precio válido (más de 99999.99, cero o con otro formato).
 * Dinero exacto: nunca pasa por `number` de punto flotante.
 */
export function normalizarPrecio(texto: string): string | null {
  const separadores = [...texto.matchAll(/[.,]/g)];
  let entero = texto;
  let decimales = '';
  const ultimo = separadores.at(-1);
  if (ultimo?.index !== undefined) {
    const despues = texto.slice(ultimo.index + 1);
    // «12.505» con un solo separador y tres cifras: ¿miles o tres decimales?
    // Ante la duda no se adivina (RN-13): sin precio.
    if (separadores.length === 1 && despues.length === 3) {
      return null;
    }
    if (despues.length <= 2) {
      entero = texto.slice(0, ultimo.index);
      decimales = despues;
    }
  }
  const limpio = `${entero.replace(/[.,]/g, '')}${decimales === '' ? '' : `.${decimales}`}`;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(limpio)) {
    return null;
  }
  const dinero = Dinero.desdeTexto(limpio);
  return dinero.esMayorQue(Dinero.CERO) ? dinero.aTexto() : null;
}
