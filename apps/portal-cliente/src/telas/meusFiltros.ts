import { normalizeSearch } from '@betinhos/ui'
import { diaLocal } from '../domain/regras'
import type { Pedido, StatusPedido } from '../domain/types'

export type AbaPedidos = 'proximos' | 'todos'
export type Situacao = 'solicitado' | 'programado' | 'concluido' | 'cancelado'

const ENCERRADO = new Set<StatusPedido>(['concluido', 'cancelado'])

/** Filtro de situação: Solicitado junta tudo que ainda não tem motorista programado. */
const NA_SITUACAO: Record<Situacao, StatusPedido[]> = {
  solicitado: ['solicitado', 'em_analise', 'confirmado'],
  programado: ['programado', 'em_execucao'],
  concluido: ['concluido'],
  cancelado: ['cancelado'],
}
export const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'solicitado', label: 'Solicitado' }, { value: 'programado', label: 'Programado' },
  { value: 'concluido', label: 'Concluído' }, { value: 'cancelado', label: 'Cancelado' },
]

/** Próximos: saída daqui para a frente e ainda não encerrado, do mais perto para o mais longe; Todos: do mais recente para o mais antigo. */
export function daAbaPedidos(pedidos: Pedido[], aba: AbaPedidos, agoraMs: number): Pedido[] {
  const lista = aba === 'todos' ? pedidos : pedidos.filter((p) => Date.parse(p.saida) >= agoraMs && !ENCERRADO.has(p.status))
  const ms = (p: Pedido) => Date.parse(p.saida) || 0
  return [...lista].sort((a, b) => (aba === 'todos' ? ms(b) - ms(a) : ms(a) - ms(b)))
}

/** Busca (código, passageiro, local, motorista ou placa; sem acento, todas as palavras) e situação. */
export function filtrarPedidos(pedidos: Pedido[], f: { busca: string; situacao: Situacao | null }): Pedido[] {
  const termos = normalizeSearch(f.busca).split(/\s+/).filter(Boolean)
  const status = f.situacao ? new Set(NA_SITUACAO[f.situacao]) : null
  return pedidos.filter((p) => {
    if (status && !status.has(p.status)) return false
    if (!termos.length) return true
    const alvo = normalizeSearch([p.numero, p.origem, p.destino, p.motorista, p.placa, ...p.passageiros].filter(Boolean).join(' '))
    return termos.every((t) => alvo.includes(t))
  })
}

const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** "Quarta, 26/11" (com o ano quando não é o de `hoje`); dia yyyy-mm-dd já em São Paulo. */
export function tituloDia(dia: string, hoje: string): string {
  const [a, m, d] = dia.split('-')
  const semana = SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]
  return `${semana}, ${d}/${m}${a === hoje.slice(0, 4) ? '' : `/${a}`}`
}

/** Grupos por dia da saída (São Paulo), na ordem em que os pedidos já vêm. */
export function agruparPorDia(pedidos: Pedido[], agoraMs: number): { dia: string; titulo: string; pedidos: Pedido[] }[] {
  const hoje = diaLocal(new Date(agoraMs).toISOString())
  const grupos: { dia: string; titulo: string; pedidos: Pedido[] }[] = []
  for (const p of pedidos) {
    const dia = p.saida ? diaLocal(p.saida) : ''
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.dia === dia) ultimo.pedidos.push(p)
    else grupos.push({ dia, titulo: dia ? tituloDia(dia, hoje) : 'Sem data', pedidos: [p] })
  }
  return grupos
}
