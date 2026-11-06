import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { crearValidationPipe } from './validacion.js';

class LineaPrueba {
  @IsString()
  idProducto!: string;

  @Type(() => Number)
  @IsInt({ message: 'cantidad debe ser un entero' })
  @Min(1, { message: 'cantidad debe ser mayor que 0' })
  cantidad!: number;
}

class PedidoPrueba {
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, { message: 'total debe ser un decimal' })
  total!: string;

  @ValidateNested({ each: true })
  @Type(() => LineaPrueba)
  lineas!: LineaPrueba[];
}

const METADATOS = { type: 'body', metatype: PedidoPrueba } as const;

async function capturar(valor: unknown): Promise<BadRequestException> {
  try {
    await crearValidationPipe().transform(valor, METADATOS);
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('La validación debía fallar');
}

describe('RNF-03: ValidationPipe global', () => {
  it('acepta y transforma datos válidos', async () => {
    const resultado: unknown = await crearValidationPipe().transform(
      { total: '12.50', lineas: [{ idProducto: 'p1', cantidad: '2' }] },
      METADATOS,
    );

    expect(resultado).toBeInstanceOf(PedidoPrueba);
    expect((resultado as PedidoPrueba).lineas[0].cantidad).toBe(2);
  });

  it('rechaza campos no declarados con 400 DATOS_INVALIDOS', async () => {
    const error = await capturar({
      total: '1.00',
      lineas: [],
      precioCliente: '0.01',
    });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      detalles: {
        errores: [{ campo: 'precioCliente', errores: expect.any(Array) }],
      },
    });
  });

  it('informa los campos anidados inválidos sin repetir los valores enviados', async () => {
    const error = await capturar({
      total: '1.234',
      lineas: [{ idProducto: 'p1', cantidad: '0' }],
    });

    const cuerpo = error.getResponse();
    expect(cuerpo).toEqual({
      codigo: 'DATOS_INVALIDOS',
      mensaje: 'Los datos enviados no son válidos.',
      detalles: {
        errores: [
          { campo: 'total', errores: ['total debe ser un decimal'] },
          {
            campo: 'lineas.0.cantidad',
            errores: ['cantidad debe ser mayor que 0'],
          },
        ],
      },
    });
    expect(JSON.stringify(cuerpo)).not.toContain('1.234');
  });

  it('no repite un mensaje compartido por varias reglas del mismo campo', async () => {
    class IngresoPrueba {
      @IsString({ message: 'Ingrese su clave.' })
      @IsNotEmpty({ message: 'Ingrese su clave.' })
      clave!: string;
    }

    let error: BadRequestException | undefined;
    try {
      await crearValidationPipe().transform(
        { clave: null },
        { type: 'body', metatype: IngresoPrueba },
      );
    } catch (e) {
      error = e as BadRequestException;
    }

    expect(error?.getResponse()).toMatchObject({
      detalles: {
        errores: [{ campo: 'clave', errores: ['Ingrese su clave.'] }],
      },
    });
  });
});
