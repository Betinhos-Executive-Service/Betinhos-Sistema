import { normalizeSearch } from '@betinhos/ui'
import { aguardaCliente, diaLocal } from '../domain/regras'
import type { Servico } from '../domain/types'

export type Aba = 'a_validar' | 'em_duvida' | 'aprovados' | 'todos'
type Filtro = { mes: string | null; cr: string | null; busca: string }

const NA_ABA: Record<Aba, (s: Servico) => boolean> = {
  // "A validar" depende do cliente; "Em dúvida" espera a Betinhos.
  a_validar: aguardaCliente,
  em_duvida: (s) => s.status === 'em_duvida',
  aprovados: (s) => s.status === 'aprovado' || s.status === 'aprovado_tacito',
  todos: () => true,
}
export const ABAS = Object.keys(NA_ABA) as Aba[]

/** yyyy-mm da saída, em America/Sao_Paulo. */
const mesDe =(s: Servico) => diaLocal(s.saida).slice(0, 7)

/** Mês, CR e busca: a parte do filtro que vale para todas as abas (e para as contagens). */
export function filtrarBase(servicos: Servico[], f: Filtro): Servico[] {
  const termos = normalizeSearch(f.busca).split(/\s+/).filter(Boolean)
  return servicos.filter((s) => {
    if ((f.mes && mesDe(s) !== f.mes) || (f.cr && s.cr !== f.cr)) return false
    if (!termos.length) return true
    const alvo = normalizeSearch([s.numero, s.pedidoCliente, s.origem, s.destino, s.solicitante, ...s.passageiros].join(' '))
    return termos.every((t) => alvo.includes(t))
  })
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Serviços da aba, do prazo da aprovação automática mais próximo para o mais distante. */
export function daAba(base: Servico[], aba: Aba): Servico[] {
  return base.filter(NA_ABA[aba]).sort((a, b) => comparar(a.prazoTacito, b.prazoTacito) || comparar(a.saida, b.saida))
}

export function contar(base: Servico[]): Record<Aba, number> {
  const r = { a_validar: 0, em_duvida: 0, aprovados: 0, todos: 0 }
  for (const s of base) for (const a of ABAS) if (NA_ABA[a](s)) r[a]++
  return r
}

const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Meses presentes na lista, do mais recente para o mais antigo. */
export function mesesDisponiveis(servicos: Servico[]): { value: string; label: string }[] {
  return [...new Set(servicos.map(mesDe))]
    .sort((a, b) => comparar(b, a))
    .map((m) => {
      const label = nomeMes.format(new Date(`${m}-15T12:00:00Z`))
      return { value: m, label: label.charAt(0).toUpperCase() + label.slice(1) }
    })
}
