/**
 * Políticas públicas de CatálogoStock (RF-USU-07; contrato cuenta-y-politicas,
 * §2). TypeScript puro: páginas HTML estáticas en español, sin datos personales.
 *
 * ATENCIÓN: los textos son **borradores técnicos**. Deben ser revisados por una
 * persona con formación legal antes de publicar la app (PA-21, PA-12).
 *
 * Las páginas no usan scripts en línea ni de terceros: el formulario de
 * eliminar cuenta carga `/politicas/eliminar-cuenta.js`, un archivo propio del
 * mismo origen. Los estilos van en un único `<style>` cuyo hash viaja en la
 * política `Content-Security-Policy`.
 */

/** Versión vigente de la política de privacidad (la misma del aviso que se acepta al registrarse). */
export const VERSION_PRIVACIDAD = '2026-11-1';
/** Versión vigente de los términos de uso. */
export const VERSION_TERMINOS = '2026-11-1';
/** Fecha de la última actualización de los textos. */
export const FECHA_ACTUALIZACION = '18 de noviembre de 2026';

export const RUTA_PRIVACIDAD = '/politicas/privacidad';
export const RUTA_TERMINOS = '/politicas/terminos';
export const RUTA_ELIMINAR_CUENTA = '/politicas/eliminar-cuenta';
export const RUTA_SCRIPT_ELIMINAR_CUENTA = '/politicas/eliminar-cuenta.js';

/** Rutas que se sirven fuera del prefijo `/api/v1` (las páginas y su script). */
export const RUTAS_PAGINAS_POLITICAS = [
  RUTA_PRIVACIDAD,
  RUTA_TERMINOS,
  RUTA_ELIMINAR_CUENTA,
  RUTA_SCRIPT_ELIMINAR_CUENTA,
] as const;

/** Estilos de todas las páginas (un solo bloque, autorizado por hash en la CSP). */
export const ESTILOS_POLITICAS = `
body{font-family:Arial,Helvetica,sans-serif;color:#1E293B;background:#F8FAFC;margin:0;line-height:1.55}
main{max-width:46rem;margin:0 auto;padding:1.25rem}
h1{color:#2563EB;font-size:1.6rem}
h2{color:#1E293B;font-size:1.2rem;margin-top:1.6rem}
a{color:#2563EB}
.aviso{background:#FFFFFF;border-left:4px solid #7C3AED;padding:.6rem .9rem;font-size:.9rem}
label{display:block;margin-top:.8rem;font-weight:bold}
input[type=email],input[type=text]{width:100%;max-width:22rem;padding:.55rem;border:1px solid #64748B;border-radius:6px;font-size:1rem;box-sizing:border-box}
button{margin-top:1rem;padding:.65rem 1.2rem;border:0;border-radius:6px;background:#2563EB;color:#FFFFFF;font-size:1rem;cursor:pointer}
button[disabled]{opacity:.6;cursor:not-allowed}
#mensaje{margin-top:1rem;font-weight:bold}
.oculto{display:none}
`.trim();

/** Script del formulario de eliminar cuenta: correo → código → confirmar. Usa los dos endpoints públicos. */
export const SCRIPT_ELIMINAR_CUENTA = `
(function () {
  'use strict';
  var pasoCorreo = document.getElementById('paso-correo');
  var pasoCodigo = document.getElementById('paso-codigo');
  var mensaje = document.getElementById('mensaje');
  var campoCorreo = document.getElementById('correo');
  var campoCodigo = document.getElementById('codigo');
  var correo = '';

  function avisar(texto) { mensaje.textContent = texto; }

  function enviar(ruta, cuerpo) {
    return fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
  }

  pasoCorreo.addEventListener('submit', function (evento) {
    evento.preventDefault();
    correo = campoCorreo.value.trim();
    avisar('Enviando…');
    enviar('/api/v1/autenticacion/eliminacion/solicitud', { correo: correo })
      .then(function (respuesta) {
        if (respuesta.status === 204) {
          pasoCodigo.classList.remove('oculto');
          avisar('Si el correo corresponde a una cuenta con el correo verificado, enviamos un código de 6 dígitos. Escríbelo abajo.');
        } else if (respuesta.status === 429) {
          avisar('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
        } else {
          avisar('Revisa que el correo sea válido.');
        }
      })
      .catch(function () { avisar('No pudimos conectar. Inténtalo de nuevo.'); });
  });

  pasoCodigo.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (!document.getElementById('confirmar').checked) {
      avisar('Marca la casilla para confirmar que entiendes que no se puede deshacer.');
      return;
    }
    avisar('Eliminando…');
    enviar('/api/v1/autenticacion/eliminacion', { correo: correo, codigo: campoCodigo.value.trim() })
      .then(function (respuesta) {
        if (respuesta.status === 204) {
          pasoCorreo.classList.add('oculto');
          pasoCodigo.classList.add('oculto');
          avisar('Tu cuenta fue eliminada. Tus datos personales se anonimizaron.');
        } else if (respuesta.status === 422) {
          avisar('El código no es válido o ya venció. Pide uno nuevo.');
        } else if (respuesta.status === 429) {
          avisar('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
        } else {
          avisar('Revisa el código de 6 dígitos.');
        }
      })
      .catch(function () { avisar('No pudimos conectar. Inténtalo de nuevo.'); });
  });
})();
`.trim();

function pagina(
  titulo: string,
  version: string | null,
  cuerpo: string,
  rutaScript: string | null,
): string {
  const versionTexto =
    version === null ? '' : ` · Versión ${version}`;
  return [
    '<!doctype html>',
    '<html lang="es"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${titulo} · CatálogoStock</title>`,
    `<style>${ESTILOS_POLITICAS}</style>`,
    '</head><body><main>',
    `<h1>${titulo}</h1>`,
    `<p class="aviso">CatálogoStock${versionTexto} · Última actualización: ${FECHA_ACTUALIZACION}</p>`,
    cuerpo,
    '<p><a href="/politicas/privacidad">Política de privacidad</a> · <a href="/politicas/terminos">Términos de uso</a> · <a href="/politicas/eliminar-cuenta">Eliminar mi cuenta</a></p>',
    rutaScript === null ? '' : `<script src="${rutaScript}"></script>`,
    '</main></body></html>',
  ].join('\n');
}

export function paginaPrivacidad(): string {
  return pagina(
    'Política de privacidad',
    VERSION_PRIVACIDAD,
    `
<p>CatálogoStock es una aplicación para consultar un catálogo de productos por marcas, armar un carrito, hacer pedidos y coordinar el pago con el vendedor de la tienda.</p>
<h2>Qué datos recogemos</h2>
<ul>
<li><strong>Datos de la cuenta:</strong> nombre, correo electrónico y teléfono celular.</li>
<li><strong>Datos de uso:</strong> los pedidos que haces y su estado.</li>
<li><strong>Comprobantes de pago:</strong> las imágenes o PDF de transferencias que decides subir. Se guardan en un almacenamiento privado y solo las ven el vendedor y tú.</li>
</ul>
<p>No guardamos números de tarjeta, códigos de seguridad ni credenciales bancarias.</p>
<h2>Para qué los usamos</h2>
<p>Para crear y proteger tu cuenta, procesar tus pedidos, verificar tus pagos, enviarte códigos de seguridad a tu correo y permitirte contactar al vendedor.</p>
<h2>Base del consentimiento</h2>
<p>Tratamos tus datos con tu consentimiento, que das al registrarte aceptando esta política y los términos de uso. Puedes retirarlo eliminando tu cuenta.</p>
<h2>Con quién se comparten</h2>
<ul>
<li><strong>El vendedor</strong> de la tienda ve tus datos de contacto y tus pedidos para atenderlos.</li>
<li><strong>PayPhone</strong> (pagos electrónicos): solo recibimos de ellos un identificador, una referencia y el estado del pago. No vemos ni guardamos los datos de tu tarjeta.</li>
<li><strong>WhatsApp:</strong> el botón de contacto abre WhatsApp en tu teléfono; la conversación es entre tú y el vendedor y la inicias tú.</li>
</ul>
<p>No vendemos tus datos ni los usamos para publicidad.</p>
<h2>Cuánto tiempo los conservamos</h2>
<p>Mientras tu cuenta esté activa. Si la eliminas, tus datos personales se anonimizan de forma irreversible. Los pedidos y pagos ya realizados se conservan sin datos que te identifiquen, para la contabilidad del vendedor.</p>
<h2>Tus derechos</h2>
<p>Tienes derecho de acceso, rectificación, eliminación, oposición y portabilidad de tus datos. Puedes consultar y corregir tus datos desde la aplicación, y <a href="/politicas/eliminar-cuenta">eliminar tu cuenta</a> desde la app o desde esta web. Para cualquier otra solicitud, escribe al vendedor desde el botón «Contactar por WhatsApp» de la aplicación.</p>
<h2>Seguridad</h2>
<p>Las claves se guardan cifradas, la comunicación usa HTTPS y cada persona solo accede a sus propios pedidos y comprobantes.</p>
<h2>Contacto</h2>
<p>Usa el botón «Contactar por WhatsApp» de la aplicación, que muestra los datos de contacto de la tienda.</p>
`,
    null,
  );
}

export function paginaTerminos(): string {
  return pagina(
    'Términos de uso',
    VERSION_TERMINOS,
    `
<h2>El servicio</h2>
<p>CatálogoStock permite consultar el catálogo de un vendedor, hacer pedidos y coordinar su pago. La venta es entre tú y el vendedor; la aplicación es la herramienta para hacerlo.</p>
<h2>Edad mínima</h2>
<p>Debes tener al menos 18 años para crear una cuenta.</p>
<h2>Tu cuenta</h2>
<p>Los datos que registras deben ser verdaderos. Eres responsable de guardar tu clave y de lo que se haga con tu cuenta.</p>
<h2>Pedidos, reservas y abono</h2>
<p>Un pedido no está confirmado hasta que el vendedor lo confirme: la disponibilidad la decide el servidor y el stock se reserva por orden de llegada. Si el pedido es por encargo, el vendedor puede pedir un abono antes de confirmarlo; las condiciones del abono y de las reservas las informa el vendedor en cada pedido.</p>
<h2>Pagos</h2>
<p>Puedes pagar por transferencia (el vendedor revisa tu comprobante y confirma el pago) o con PayPhone (el pago se confirma cuando el sistema verifica la transacción). Subir un comprobante no confirma un pago por sí solo.</p>
<h2>Precios e inventario</h2>
<p>Los precios y existencias son los oficiales del servidor. Los datos que ves sin conexión pueden estar desactualizados hasta que sincronices.</p>
<h2>Responsabilidad</h2>
<p>Hacemos lo posible por que el servicio esté disponible y los datos sean correctos, pero no garantizamos la disponibilidad futura de productos ni un servicio sin interrupciones.</p>
<h2>Eliminar tu cuenta</h2>
<p>Puedes <a href="/politicas/eliminar-cuenta">eliminar tu cuenta</a> cuando quieras.</p>
<h2>Contacto</h2>
<p>Usa el botón «Contactar por WhatsApp» de la aplicación.</p>
`,
    null,
  );
}

export function paginaEliminarCuenta(): string {
  return pagina(
    'Eliminar mi cuenta',
    null,
    `
<h2>Desde la aplicación</h2>
<ol>
<li>Abre CatálogoStock e inicia sesión.</li>
<li>Entra a tu perfil y elige «Eliminar mi cuenta».</li>
<li>Escribe tu clave para confirmar.</li>
</ol>
<h2>Desde esta página web</h2>
<p>Si ya no tienes la aplicación, puedes eliminarla aquí. Necesitas que tu correo esté verificado: te enviaremos un código de 6 dígitos que vence en 15 minutos.</p>
<form id="paso-correo">
<label for="correo">Correo de tu cuenta</label>
<input id="correo" type="email" autocomplete="email" required maxlength="254">
<button type="submit">Enviarme el código</button>
</form>
<form id="paso-codigo" class="oculto">
<label for="codigo">Código de 6 dígitos</label>
<input id="codigo" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
<label><input id="confirmar" type="checkbox"> Entiendo que mi cuenta se eliminará y que no se puede deshacer.</label>
<button type="submit">Eliminar mi cuenta</button>
</form>
<p id="mensaje" role="status"></p>
<h2>Qué se elimina y qué se conserva</h2>
<ul>
<li><strong>Se elimina:</strong> tu nombre, correo y teléfono (quedan anonimizados de forma irreversible), tu clave y tus sesiones abiertas. Tu correo y teléfono podrán usarse para registrar una cuenta nueva.</li>
<li><strong>Se conserva:</strong> los pedidos y pagos ya realizados y el registro de actividad, apuntando a una cuenta anónima, sin datos que te identifiquen. Se guardan para la contabilidad del vendedor.</li>
</ul>
`,
    RUTA_SCRIPT_ELIMINAR_CUENTA,
  );
}
