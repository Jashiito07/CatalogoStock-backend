import type { AvisoPrivacidad } from '../../dominio/aviso-privacidad.js';

/**
 * Aviso de privacidad de CatálogoStock (RNF-16, D-11).
 *
 * BORRADOR PROVISIONAL (D-15): el autor o el facilitador deben revisarlo
 * antes de publicar la app. Al cambiar el texto hay que cambiar `version`:
 * los registros nuevos deben aceptar la versión vigente.
 */
export const AVISO_PRIVACIDAD_VIGENTE: AvisoPrivacidad = Object.freeze({
  version: '2026-11-1',
  titulo: 'Aviso de privacidad de CatálogoStock',
  vigenteDesde: new Date('2026-11-05T00:00:00-05:00'),
  contenido: `PROVISIONAL – revisar antes de publicar

# Aviso de privacidad de CatálogoStock

Este aviso explica qué datos personales recogemos cuando usas CatálogoStock, para qué los usamos y qué derechos tienes, de acuerdo con la Ley Orgánica de Protección de Datos Personales del Ecuador.

## 1. Responsable del tratamiento

El responsable de tus datos es la persona vendedora que administra esta tienda en CatálogoStock. Sus datos de contacto se completarán antes de publicar la app.

## 2. Datos que recogemos

- **Datos de tu cuenta:** nombre, correo electrónico, número de celular y clave. La clave se guarda cifrada con un método que no permite recuperarla; nadie puede verla.
- **Tus pedidos:** productos, cantidades, precios, estados y fechas.
- **Tus pagos:** los comprobantes de transferencia que subas y, si pagas con PayPhone, solo el identificador, la referencia y el estado de la transacción. Nunca guardamos números de tarjeta, códigos de seguridad ni claves bancarias.
- **Registro de actividad:** guardamos las acciones importantes de la cuenta (registro, inicio y cierre de sesión). Si alguien intenta iniciar sesión sin éxito, guardamos el correo que escribió, aunque no exista una cuenta con ese correo, para detectar intentos de acceso indebidos. Nunca guardamos la clave intentada.

## 3. Para qué usamos tus datos

- Crear y proteger tu cuenta.
- Mostrarte el catálogo y gestionar tus pedidos, pagos y entregas.
- Comunicarnos contigo sobre tus pedidos, por ejemplo por WhatsApp.
- Prevenir accesos indebidos y fraudes.

No usamos tus datos para publicidad ni los vendemos.

## 4. Con quién compartimos tus datos

Con nadie, salvo con PayPhone cuando eliges pagar con esa plataforma, y solo con los datos necesarios para procesar el pago.

## 5. Cuánto tiempo conservamos tus datos

El plazo de conservación de los datos y de los comprobantes está pendiente de definir y se indicará aquí antes de publicar la app.

## 6. Tus derechos

Puedes pedir en cualquier momento el acceso, la rectificación, la actualización o la eliminación de tus datos, oponerte a su tratamiento o pedir su portabilidad, como reconoce la Ley Orgánica de Protección de Datos Personales del Ecuador. Para hacerlo, escribe a la persona vendedora por los medios de contacto de la tienda.

## 7. Aceptación

Al crear tu cuenta declaras que leíste este aviso y que aceptas el tratamiento de tus datos descrito aquí. Si el aviso cambia, te pediremos aceptar la nueva versión.
`,
});
