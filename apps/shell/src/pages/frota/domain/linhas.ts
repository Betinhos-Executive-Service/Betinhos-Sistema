import { diaSP } from '../data/dates'
import { brl } from '../data/format'
import { GRAU, label } from '../data/schema'
import type { FrotaData, Kind, Ref } from '../data/types'

export type Linha = { kind: Kind; id: string; titulo: string; veiculo: Ref | null; pessoa: Ref | null; status: number | null; dia: string | null; extra: string; categorias: number[] }

export function linhas(kind: Kind, data: FrotaData): Linha[] {
  const infracoes = new Map(data.infracoes.map((item) => [item.id, item]))
  const result: Linha[] =
    kind === 'manutencao'
      ? data.manutencoes.map((item) => ({ kind, id: item.id, titulo: item.descricao, veiculo: item.veiculo, pessoa: item.solicitante, status: item.status, dia: diaSP(item.dataManutencao ?? item.criadoEm), extra: item.valor !== null ? brl(item.valor) : label(GRAU, item.grau), categorias: item.categorias }))
      : kind === 'multa'
        ? data.multas.map((item) => ({ kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: item.infracaoId ? brl(infracoes.get(item.infracaoId)?.valor ?? null) : 'Sem código de infração', categorias: [] }))
        : data.colisoes.map((item) => ({ kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: item.houveTerceiro ? 'Com terceiro' : 'Sem terceiro', categorias: [] }))
  return result.sort((a, b) => (b.dia ?? '').localeCompare(a.dia ?? ''))
}
