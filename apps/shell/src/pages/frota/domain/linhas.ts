import { diaSP } from '../data/dates'
import { brl } from '../data/format'
import { GRAU, label } from '../data/schema'
import type { FrotaData, Kind, Ref, TermoStatus } from '../data/types'
import { rotuloTermo } from './termoMulta'

export type Linha = { kind: Kind; id: string; titulo: string; veiculo: Ref | null; pessoa: Ref | null; status: number | null; dia: string | null; extra: string; categorias: number[]; termo: string; termoStatus: TermoStatus | null }

export function linhas(kind: Kind, data: FrotaData): Linha[] {
  const infracoes = new Map(data.infracoes.map((item) => [item.id, item]))
  const result: Linha[] =
    kind === 'manutencao'
      ? data.manutencoes.map((item) => ({ kind, id: item.id, titulo: item.descricao, veiculo: item.veiculo, pessoa: item.solicitante, status: item.status, dia: diaSP(item.dataManutencao ?? item.criadoEm), extra: item.valor !== null ? brl(item.valor) : label(GRAU, item.grau), categorias: item.categorias, termo: '', termoStatus: null }))
      : kind === 'multa'
        ? data.multas.map((item) => ({ kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: valorMulta(item.valorGuia, item.infracaoId ? infracoes.get(item.infracaoId)?.valor ?? null : null, item.infracaoId), categorias: [], termo: rotuloTermo(item.termo), termoStatus: item.termo?.status ?? null }))
        : data.colisoes.map((item) => ({ kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: item.houveTerceiro ? 'Com terceiro' : 'Sem terceiro', categorias: [], termo: '', termoStatus: null }))
  return result.sort((a, b) => (b.dia ?? '').localeCompare(a.dia ?? ''))
}

/** Valor da multa na lista: o da guia (gravado no painel) vale mais que o do catálogo de infrações. */
function valorMulta(valorGuia: number | null, catalogo: number | null, infracaoId: string | null) {
  if (valorGuia !== null) return brl(valorGuia)
  return infracaoId ? brl(catalogo) : 'Sem código de infração'
}
