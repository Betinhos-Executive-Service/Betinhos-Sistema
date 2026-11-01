import type { StatusTone } from '@betinhos/ui'
import type { Modulo, NovoPedido, StatusPedido } from './types'

export const MODULO_LABEL: Record<Modulo, string> = { validar: 'Validar', pedir: 'Pedir serviço', meus_servicos: 'Meus serviços' }

export const MAX_PASSAGEIROS = 4
/** Nome de passageiro e endereço: cabem em `cr40f_portalpedido` (memo de 4000) junto com a observação. */
export const MAX_NOME = 100
export const MAX_ENDERECO = 300
/** Limite dos textos livres do portal (observação do pedido, mensagens da validação). */
export const MAX_TEXTO = 2000
/** Pedidos iguais (mesmo solicitante, saída e trajeto) neste intervalo são o mesmo clique duplo. */
export const JANELA_DUPLICADO_MS = 60 * 1000
const UM_ANO_MS = 366 * 24 * 60 * 60 * 1000

export type ErrosPedido = Partial<Record<'passageiros' | 'origem' | 'destino' | 'saida' | 'observacao', string>>

/** Pedido com espaços aparados e passageiros vazios removidos. */
export function normalizarPedido(p: NovoPedido): NovoPedido {
  const observacao = (p.observacao ?? '').trim()
  return {
    passageiros: p.passageiros.map((n) => n.trim()).filter(Boolean).slice(0, MAX_PASSAGEIROS),
    origem: p.origem.trim(),
    destino: p.destino.trim(),
    saida: p.saida,
    ...(observacao ? { observacao } : {}),
  }
}

/** Erros por campo de um pedido já normalizado; objeto vazio = pode enviar. */
export function validarPedido(p: NovoPedido, agoraMs: number): ErrosPedido {
  const e: ErrosPedido = {}
  if (!p.passageiros.length) e.passageiros = 'Informe pelo menos um passageiro.'
  else if (p.passageiros.some((n) => n.length > MAX_NOME)) e.passageiros = `Cada nome tem no máximo ${MAX_NOME} caracteres.`
  if (!p.origem) e.origem = 'Informe o endereço de saída.'
  else if (p.origem.length > MAX_ENDERECO) e.origem = `O endereço de saída tem no máximo ${MAX_ENDERECO} caracteres.`
  if (!p.destino) e.destino = 'Informe o destino.'
  else if (p.destino.length > MAX_ENDERECO) e.destino = `O destino tem no máximo ${MAX_ENDERECO} caracteres.`
  const saida = Date.parse(p.saida)
  if (Number.isNaN(saida)) e.saida = 'Informe a data e a hora da saída.'
  else if (saida < agoraMs) e.saida = 'A saída precisa ser daqui para a frente.'
  else if (saida > agoraMs + UM_ANO_MS) e.saida = 'A saída não pode passar de um ano.'
  if ((p.observacao ?? '').length > MAX_TEXTO) e.observacao = `A observação tem no máximo ${MAX_TEXTO} caracteres.`
  return e
}

export const primeiroErroPedido = (p: NovoPedido, agoraMs: number) => Object.values(validarPedido(p, agoraMs))[0]

/** O que identifica um pedido repetido dentro da janela. */
export const chaveDuplicado = (email: string, p: NovoPedido) => [email, p.saida, p.origem, p.destino].join('|').toLowerCase()

const STATUS: Record<StatusPedido, { rotulo: string; tom: StatusTone }> = {
  solicitado: { rotulo: 'Solicitado', tom: 'warning' },
  em_analise: { rotulo: 'Em análise', tom: 'warning' },
  confirmado: { rotulo: 'Confirmado', tom: 'success' },
  programado: { rotulo: 'Programado', tom: 'success' },
  em_execucao: { rotulo: 'Em execução', tom: 'info' },
  concluido: { rotulo: 'Concluído', tom: 'success' },
  cancelado: { rotulo: 'Cancelado', tom: 'danger' },
}
export const statusPedidoInfo = (s: StatusPedido) => STATUS[s]

/** `paula.ribeiro@latasa.com.br` → `Paula Ribeiro`: nome de quem entra pelo domínio, sem cadastro prévio. */
export function nomeDoEmail(email: string): string {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

export const dominioDe = (email: string) => email.split('@')[1] ?? ''
