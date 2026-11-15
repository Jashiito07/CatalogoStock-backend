import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { CorreoNoDisponibleError } from '../../dominio/errores-correo.js';
import { EnviadorCorreoApagado } from './enviador-correo.apagado.js';
import {
  EnviadorCorreoNodemailer,
  type OpcionesSmtp,
  type TransporteCorreo,
} from './enviador-correo.nodemailer.js';

type EnviarCorreo = TransporteCorreo['sendMail'];

/** Todo es falso: ningún servidor ni cuenta reales; el transporte es un doble. */
const OPCIONES: OpcionesSmtp = {
  servidor: 'smtp.ejemplo.test',
  puerto: 465,
  usuario: 'cuenta.falsa@ejemplo.test',
  clave: 'clave-de-aplicacion-falsa',
  remitente: 'CatálogoStock <cuenta.falsa@ejemplo.test>',
};

const MENSAJE = {
  para: 'maria@ejemplo.test',
  asunto: 'Tu código de CatálogoStock',
  texto: 'Tu código es: 482913',
  html: '<p>482913</p>',
};

function salidaDeLogs(
  espias: ReturnType<typeof vi.spyOn>[],
): string {
  return espias
    .flatMap((espia) => espia.mock.calls)
    .map((llamada) => llamada.map(String).join(' '))
    .join('\n');
}

describe('Contrato de correo: adaptador nodemailer (con transporte simulado)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('envía desde el remitente configurado, al destinatario indicado y con texto y HTML', async () => {
    const sendMail = vi.fn<EnviarCorreo>().mockResolvedValue({});
    const transporte: TransporteCorreo = { sendMail };

    await new EnviadorCorreoNodemailer(OPCIONES, transporte).enviar(MENSAJE);

    expect(sendMail).toHaveBeenCalledExactlyOnceWith({
      from: OPCIONES.remitente,
      to: MENSAJE.para,
      subject: MENSAJE.asunto,
      text: MENSAJE.texto,
      html: MENSAJE.html,
    });
  });

  it('si el SMTP falla → CorreoNoDisponibleError genérico; el log no trae correos, códigos ni claves', async () => {
    const advertir = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const fallo = Object.assign(
      new Error(
        `535 Authentication failed for ${OPCIONES.usuario} (${OPCIONES.clave}) enviando a ${MENSAJE.para}: ${MENSAJE.texto}`,
      ),
      { code: 'EAUTH' },
    );
    const transporte: TransporteCorreo = {
      sendMail: vi.fn<EnviarCorreo>().mockRejectedValue(fallo),
    };

    const envio = new EnviadorCorreoNodemailer(OPCIONES, transporte).enviar(
      MENSAJE,
    );

    await expect(envio).rejects.toBeInstanceOf(CorreoNoDisponibleError);
    await expect(envio).rejects.not.toHaveProperty('cause');
    const registrado = salidaDeLogs([advertir, error, log]);
    expect(registrado).toContain('EAUTH');
    for (const secreto of [
      OPCIONES.clave,
      OPCIONES.usuario,
      MENSAJE.para,
      '482913',
      OPCIONES.servidor,
    ]) {
      expect(registrado).not.toContain(secreto);
    }
  });

  it('un error sin código reconocible se registra como DESCONOCIDO', async () => {
    const advertir = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const transporte: TransporteCorreo = {
      sendMail: vi.fn<EnviarCorreo>().mockRejectedValue(new Error('algo con maria@ejemplo.test')),
    };

    await expect(
      new EnviadorCorreoNodemailer(OPCIONES, transporte).enviar(MENSAJE),
    ).rejects.toBeInstanceOf(CorreoNoDisponibleError);
    expect(salidaDeLogs([advertir])).toContain('DESCONOCIDO');
    expect(salidaDeLogs([advertir])).not.toContain('maria@');
  });

  it('el mensaje de error es genérico: sin servidor, usuario ni clave', async () => {
    const transporte: TransporteCorreo = {
      sendMail: vi.fn<EnviarCorreo>().mockRejectedValue(new Error(OPCIONES.clave)),
    };
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const rechazo = await new EnviadorCorreoNodemailer(OPCIONES, transporte)
      .enviar(MENSAJE)
      .catch((e: unknown) => e as Error);

    expect(rechazo.message).toBe(
      'El servicio de correo no está disponible. Inténtalo de nuevo en unos minutos.',
    );
    expect(JSON.stringify(rechazo)).not.toContain(OPCIONES.clave);
  });

  it('serializado por error no muestra la clave SMTP', () => {
    const enviador = new EnviadorCorreoNodemailer(OPCIONES, {
      sendMail: vi.fn<EnviarCorreo>(),
    });
    expect(JSON.stringify(enviador)).toBe('{}');
  });

  it('crea el transporte real (sin conectar) cuando no se inyecta uno', () => {
    expect(() => new EnviadorCorreoNodemailer(OPCIONES)).not.toThrow();
  });

  it('modo apagado (CORREO_ACTIVO=false): no envía y solo deja en el log el hecho, sin destinatario ni código', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    await new EnviadorCorreoApagado().enviar(MENSAJE);

    const registrado = salidaDeLogs([log]);
    expect(registrado).toContain('omitido');
    expect(registrado).not.toContain(MENSAJE.para);
    expect(registrado).not.toContain('482913');
  });
});
