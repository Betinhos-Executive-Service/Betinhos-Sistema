import { SEM_CLIENTE, SEM_MOTORISTA } from './codes'
import { agrupar } from './base'
import { mesRotulo } from './periodo'
import type { CategoriaVeiculo, Reserva, Veiculo } from './types'

export type TopMotorista = { key: string; nome: string; qtd: number; fat: number }
export type ProducaoPT = { classificados: number; meses: { mes: string; rotulo: string; propria: number; terceirizada: number }[]; topPropria: TopMotorista[]; topTerceirizada: TopMotorista[] }

export function producaoPropriaTerceira(rv: Reserva[], veiculos: Veiculo[]): ProducaoPT {
  const tipo = new Map(veiculos.map((v) => [v.id, v.categoria]))
  const classificados = rv.map((r) => ({ r, kind: (tipo.get(r.veiculoId) ?? '') as CategoriaVeiculo })).filter((x) => x.kind)
  // O legado usa o mês do texto bruto (UTC), sem fuso.
  const meses = [...new Set(classificados.map(({ r }) => r.saidaRaw.slice(0, 7)).filter(Boolean))].sort()
  const conta = (mes: string, kind: CategoriaVeiculo) => classificados.filter((x) => x.kind === kind && x.r.saidaRaw.slice(0, 7) === mes).length
  const ranking = (kind: CategoriaVeiculo) => {
    const grupos = new Map<string, TopMotorista>()
    for (const { r } of classificados.filter((x) => x.kind === kind && x.r.motorista && x.r.motorista !== SEM_MOTORISTA)) {
      const atual = grupos.get(r.motoristaKey) ?? { key: r.motoristaKey, nome: r.motorista, qtd: 0, fat: 0 }
      atual.qtd += 1
      atual.fat += r.valor || 0
      grupos.set(r.motoristaKey, atual)
    }
    return [...grupos.values()].sort((a, b) => b.fat - a.fat || b.qtd - a.qtd).slice(0, 5)
  }
  return {
    classificados: classificados.length,
    meses: meses.map((mes) => ({ mes, rotulo: mesRotulo(mes), propria: conta(mes, 'Propria'), terceirizada: conta(mes, 'Terceirizada') })),
    topPropria: ranking('Propria'),
    topTerceirizada: ranking('Terceirizada'),
  }
}

export type Emergenciais = {
  total: number
  de: number
  percentual: number
  top3: { cliente: string; qtd: number; percentual: number }[]
  meses: { mes: string; rotulo: string; ranking: { cliente: string; qtd: number }[] }[]
}

const rankClientes = (rows: Reserva[], max: number) =>
  [...agrupar(rows, (r) => r.cliente || SEM_CLIENTE)].map(([cliente, list]) => ({ cliente, qtd: list.length }))
    .sort((a, b) => b.qtd - a.qtd || a.cliente.localeCompare(b.cliente, 'pt-BR')).slice(0, max)

/** Emergencial: `createdon` no mesmo dia (texto bruto UTC) da saída. */
export function emergenciais(rv: Reserva[]): Emergenciais {
  const em = rv.filter((r) => r.criadoRaw.slice(0, 10) === r.saidaRaw.slice(0, 10))
  const porMes = agrupar(em, (r) => r.saidaRaw.slice(0, 7))
  return {
    total: em.length,
    de: rv.length,
    percentual: rv.length ? (em.length / rv.length) * 100 : 0,
    top3: rankClientes(em, 3).map((x) => ({ ...x, percentual: em.length ? (x.qtd / em.length) * 100 : 0 })),
    meses: [...porMes.keys()].sort().map((mes) => ({ mes, rotulo: mesRotulo(mes), ranking: rankClientes(porMes.get(mes) ?? [], 5) })),
  }
}
