import { NoEncontradoError } from '../../../compartido/dominio/errores.js';
import {
  type ActorAutenticado,
  alcanceDeConsulta,
  exigirAccesoARecurso,
  MENSAJE_RECURSO_NO_ENCONTRADO,
  puedeAccederARecurso,
} from './propiedad.js';

interface PedidoFicticio {
  id: string;
  idCliente: string;
}

const MARIA: ActorAutenticado = { id: 'cliente-maria', rol: 'CLIENTE' };
const PEDRO: ActorAutenticado = { id: 'cliente-pedro', rol: 'CLIENTE' };
const VENDEDOR: ActorAutenticado = { id: 'vendedor-1', rol: 'VENDEDOR' };

const PEDIDO_DE_MARIA: PedidoFicticio = {
  id: 'pedido-1',
  idCliente: MARIA.id,
};
const duenoDelPedido = (pedido: PedidoFicticio) => pedido.idCliente;
const accederAjeno = () =>
  exigirAccesoARecurso(PEDRO, PEDIDO_DE_MARIA, duenoDelPedido);
const accederInexistente = () =>
  exigirAccesoARecurso<PedidoFicticio>(PEDRO, null, duenoDelPedido);

describe('RF-USU-03 / CA-02 / CA-19: regla de propiedad de los recursos', () => {
  describe('puedeAccederARecurso', () => {
    it('Dado un Cliente, cuando el recurso es suyo, entonces puede acceder', () => {
      expect(puedeAccederARecurso(MARIA, MARIA.id)).toBe(true);
    });

    it('Dado un Cliente, cuando el recurso es de otro Cliente, entonces no puede acceder', () => {
      expect(puedeAccederARecurso(PEDRO, MARIA.id)).toBe(false);
    });

    it('Dado el Vendedor (PA-09), cuando el recurso es de cualquier Cliente, entonces puede acceder (CA-19)', () => {
      expect(puedeAccederARecurso(VENDEDOR, MARIA.id)).toBe(true);
      expect(puedeAccederARecurso(VENDEDOR, PEDRO.id)).toBe(true);
    });

    it('un Cliente con id vacío nunca coincide, ni siquiera con un dueño vacío', () => {
      expect(puedeAccederARecurso({ id: '', rol: 'CLIENTE' }, '')).toBe(false);
    });
  });

  describe('exigirAccesoARecurso', () => {
    it('devuelve el recurso cuando es del Cliente', () => {
      expect(exigirAccesoARecurso(MARIA, PEDIDO_DE_MARIA, duenoDelPedido)).toBe(
        PEDIDO_DE_MARIA,
      );
    });

    it('devuelve el recurso de cualquier Cliente al Vendedor', () => {
      expect(
        exigirAccesoARecurso(VENDEDOR, PEDIDO_DE_MARIA, duenoDelPedido),
      ).toBe(PEDIDO_DE_MARIA);
    });

    it('un recurso ajeno responde lo mismo que uno inexistente: 404 NO_ENCONTRADO', () => {
      for (const intento of [accederAjeno, accederInexistente]) {
        expect(intento).toThrow(NoEncontradoError);
        expect(intento).toThrow(MENSAJE_RECURSO_NO_ENCONTRADO);
      }
    });

    it('con undefined también responde 404, también para el Vendedor', () => {
      expect(() =>
        exigirAccesoARecurso<PedidoFicticio>(
          VENDEDOR,
          undefined,
          duenoDelPedido,
        ),
      ).toThrow(NoEncontradoError);
    });

    it('acepta un mensaje propio del recurso', () => {
      expect(() =>
        exigirAccesoARecurso(
          PEDRO,
          PEDIDO_DE_MARIA,
          duenoDelPedido,
          'Pedido no encontrado.',
        ),
      ).toThrow('Pedido no encontrado.');
    });
  });

  describe('alcanceDeConsulta', () => {
    it('el Cliente solo consulta lo suyo', () => {
      expect(alcanceDeConsulta(MARIA)).toEqual({
        tipo: 'DEL_DUENO',
        idDueno: MARIA.id,
      });
    });

    it('el Vendedor consulta todo (CA-19)', () => {
      expect(alcanceDeConsulta(VENDEDOR)).toEqual({ tipo: 'TODOS' });
    });
  });
});
