import {
  CorreoNoDisponibleError,
  type EnviadorCorreo,
  type MensajeCorreo,
} from '../../src/modulos/usuarios/index.js';

/**
 * Transporte de correo falso en memoria para las pruebas e2e (contrato de
 * correo, D-50): sustituye a `ENVIADOR_CORREO` en `crearAppPruebas`. Las
 * pruebas **nunca** envían correos reales: lo «enviado» solo queda en la
 * lista `enviados`.
 */
export class CorreoFalso implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  /** Con `true`, el envío falla como un servicio de correo caído. */
  fallar = false;

  enviar(mensaje: MensajeCorreo): Promise<void> {
    if (this.fallar) {
      return Promise.reject(new CorreoNoDisponibleError());
    }
    this.enviados.push(structuredClone(mensaje));
    return Promise.resolve();
  }

  /** Código de 6 dígitos del último correo enviado a `para` (o del último, sin filtro). */
  ultimoCodigo(para?: string): string {
    const mensaje = this.enviados
      .filter((enviado) => para === undefined || enviado.para === para)
      .at(-1);
    const codigo = /\b(\d{6})\b/.exec(mensaje?.texto ?? '')?.[1];
    if (codigo === undefined) {
      throw new Error('No hay un correo con código en el transporte falso.');
    }
    return codigo;
  }

  reiniciar(): void {
    this.enviados.length = 0;
    this.fallar = false;
  }
}
