import { diaSP, todaySP } from '../data/dates'
import { brl } from '../data/format'
import { GRAU, label } from '../data/schema'
import type { FrotaData, Kind, Ref, TermoStatus } from '../data/types'
import { responsavelDaMulta, situacaoDaMulta } from './multaEstado'
import type { Situacao } from './multaEtapas'

export type Linha = {
  kind: Kind; id: string; titulo: string; veiculo: Ref | null; pessoa: Ref | null; status: number | null; dia: string | null; extra: string; categorias: number[]
  termo: string; termoStatus: TermoStatus | null; termoIndisponivel?: boolean
  /** Só multa: próximo passo, próximo prazo e filas das visões. */
  proximoPasso?: string; proximoPrazo?: string | null; situacoes?: string[]
}

/** Filas das visões da lista de multas (spec §7). Uma multa pode estar em mais de uma: Comigo e Prazo vencido, por exemplo. */
export function filasDaMulta(s: Situacao): string[] {
  const filas: string[] = []
  if (s.pendentes.length) filas.push('comigo')
  if (s.prazoVencido) filas.push('prazo-vencido')
  if (s.aguardandoPenalidade) filas.push('aguardando-penalidade')
  if (s.etapa === 'acertar') filas.push('aguardando-acerto')
  if (s.etapa === 'encerrada' || s.etapa === 'cancelada') filas.push('encerradas')
  return filas
}

export function linhas(kind: Kind, data: FrotaData, hoje = todaySP()): Linha[] {
  const infracoes = new Map(data.infracoes.map((item) => [item.id, item]))
  const result: Linha[] =
    kind === 'manutencao'
      ? data.manutencoes.map((item) => ({ kind, id: item.id, titulo: item.descricao, veiculo: item.veiculo, pessoa: item.solicitante, status: item.status, dia: diaSP(item.dataManutencao ?? item.criadoEm), extra: item.valor !== null ? brl(item.valor) : label(GRAU, item.grau), categorias: item.categorias, termo: '', termoStatus: null }))
      : kind === 'multa'
        ? data.multas.map((item) => {
          const s = situacaoDaMulta(item, hoje)
          return { kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: responsavelDaMulta(item), status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: valorMulta(item.valorGuia, item.infracaoId ? infracoes.get(item.infracaoId)?.valor ?? null : null, item.infracaoId), categorias: [], termo: '', termoStatus: null, proximoPasso: s.proximoPasso, proximoPrazo: s.proximoPrazo, situacoes: filasDaMulta(s) }
        })
        : data.colisoes.map((item) => ({ kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: item.houveTerceiro ? 'Com terceiro' : 'Sem terceiro', categorias: [], termo: '', termoStatus: null }))
  return result.sort((a, b) => (b.dia ?? '').localeCompare(a.dia ?? ''))
}

/** Valor da multa na lista: o da guia (gravado no painel) vale mais que o do catálogo de infrações. */
function valorMulta(valorGuia: number | null, catalogo: number | null, infracaoId: string | null) {
  if (valorGuia !== null) return brl(valorGuia)
  return infracaoId ? brl(catalogo) : 'Sem código de infração'
}
