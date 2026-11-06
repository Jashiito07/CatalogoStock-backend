import { ValidateBy } from 'class-validator';

/**
 * Valida un campo con la misma regla del dominio (objetos de valor), para que
 * el ValidationPipe liste **todos** los campos inválidos de una vez con el
 * mensaje del contrato. El caso de uso vuelve a validar (defensa en
 * profundidad). Nunca incluye el valor recibido en el error.
 */
export function CumpleReglaDominio(
  validar: (valor: unknown) => unknown,
  mensaje: string,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'cumpleReglaDominio',
      validator: {
        validate: (valor: unknown): boolean => {
          try {
            validar(valor);
            return true;
          } catch {
            return false;
          }
        },
      },
    },
    { message: mensaje },
  );
}
