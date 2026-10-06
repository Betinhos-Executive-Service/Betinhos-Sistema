import { addMonths, daysBetween, diaSP } from '../data/dates'
import { MANUT } from '../data/schema'
import type { Infracao, Manutencao, Multa } from '../data/types'

export type Periodo = { de: string; ate: string }
export type Custo = { chave: string; total: number; qtd: number; semValor: number }
export type MultasMotorista = { motorista: string; qtd: number; valor: number; pontos: number; semValor: number }

export function ultimos12Meses(today: string): Periodo {
  return { de: addMonths(today, -12), ate: today }
}

const dentro = (dia: string | null, periodo: Periodo) => dia !== null && dia >= periodo.de && dia <= periodo.ate
const diaRealizacao = (item: Manutencao) => diaSP(item.dataManutencao ?? item.criadoEm)
const centavos = (valor: number) => Math.round(valor * 100) / 100

/** Manutenções realizadas dentro do período (pela data da manutenção; sem ela, pela criação). */
export function realizadas(manutencoes: Manutencao[], periodo: Periodo) {
  return manutencoes.filter((item) => item.status === MANUT.REALIZADO && dentro(diaRealizacao(item), periodo))
}

function somar(grupos: Map<string, Custo>, chave: string, valor: number | null) {
  const atual = grupos.get(chave) ?? { chave, total: 0, qtd: 0, semValor: 0 }
  atual.qtd += 1
  if (valor === null) atual.semValor += 1
  else atual.total = centavos(atual.total + valor)
  grupos.set(chave, atual)
}

export function custoPorMes(manutencoes: Manutencao[], periodo: Periodo): Custo[] {
  const grupos = new Map<string, Custo>()
  for (let mes = periodo.de.slice(0, 7); mes <= periodo.ate.slice(0, 7); mes = addMonths(`${mes}-01`, 1).slice(0, 7)) {
    grupos.set(mes, { chave: mes, total: 0, qtd: 0, semValor: 0 })
  }
  for (const item of realizadas(manutencoes, periodo)) somar(grupos, diaRealizacao(item)!.slice(0, 7), item.valor)
  return [...grupos.values()]
}

export function custoPor(manutencoes: Manutencao[], periodo: Periodo, chave: (item: Manutencao) => string): Custo[] {
  const grupos = new Map<string, Custo>()
  for (const item of realizadas(manutencoes, periodo)) somar(grupos, chave(item), item.valor)
  return [...grupos.values()].sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave))
}

export function custoVeiculo(manutencoes: Manutencao[], veiculoId: string, periodo: Periodo): Custo {
  const grupos = new Map<string, Custo>([[veiculoId, { chave: veiculoId, total: 0, qtd: 0, semValor: 0 }]])
  for (const item of realizadas(manutencoes, periodo)) if (item.veiculo?.id === veiculoId) somar(grupos, veiculoId, item.valor)
  return grupos.get(veiculoId)!
}

/** Média de dias entre a criação e a realização; null quando não há manutenção realizada com data. */
export function tempoMedioDias(manutencoes: Manutencao[], periodo: Periodo) {
  const dias = realizadas(manutencoes, periodo)
    .filter((item) => item.dataManutencao)
    .map((item) => daysBetween(diaSP(item.criadoEm)!, diaSP(item.dataManutencao)!))
  return dias.length ? Math.round((dias.reduce((sum, value) => sum + value, 0) / dias.length) * 10) / 10 : null
}

export function multasNoPeriodo(multas: Multa[], periodo: Periodo) {
  return multas.filter((item) => dentro(diaSP(item.dataHora ?? item.criadoEm), periodo))
}

export function multasPorMotorista(multas: Multa[], infracoes: Infracao[], periodo: Periodo): MultasMotorista[] {
  const catalogo = new Map(infracoes.map((item) => [item.id, item]))
  const grupos = new Map<string, MultasMotorista>()
  for (const item of multasNoPeriodo(multas, periodo)) {
    const motorista = item.motorista?.label || 'Sem motorista'
    const atual = grupos.get(motorista) ?? { motorista, qtd: 0, valor: 0, pontos: 0, semValor: 0 }
    const infracao = item.infracaoId ? catalogo.get(item.infracaoId) : undefined
    atual.qtd += 1
    if (infracao?.valor == null) atual.semValor += 1
    else atual.valor = centavos(atual.valor + infracao.valor)
    atual.pontos += infracao?.pontos ?? 0
    grupos.set(motorista, atual)
  }
  return [...grupos.values()].sort((a, b) => b.qtd - a.qtd || a.motorista.localeCompare(b.motorista))
}

export function contarPor<T>(itens: T[], chave: (item: T) => string) {
  const grupos = new Map<string, number>()
  for (const item of itens) grupos.set(chave(item), (grupos.get(chave(item)) ?? 0) + 1)
  return [...grupos.entries()].map(([key, qtd]) => ({ chave: key, qtd })).sort((a, b) => b.qtd - a.qtd || a.chave.localeCompare(b.chave))
}
