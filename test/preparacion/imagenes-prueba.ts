/**
 * Imagen real mínima para las pruebas e2e que solo necesitan subir «una
 * foto» a un producto. Desde D-62 el servidor decodifica y vuelve a codificar
 * cada imagen, así que ya no basta con la firma de bytes: hace falta un PNG
 * válido. Este es un PNG de 1×1 píxel (RGBA).
 */
export const PNG_PRUEBA: Buffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
