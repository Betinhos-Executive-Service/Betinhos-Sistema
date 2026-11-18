import type { Celula, Planilha } from '../../../lib/xlsx'
import { addMonths, formatBR, toDateOnly } from '../../frota/data/dates'
import type { ParcelaFolha } from '../../frota/data/types'
import { mesBr } from '../../frota/domain/multaEtapas'
import { formatMoney } from '../../geral/domain/format'

export type LinhaDesconto = ParcelaFolha & { grupo: string; origemTexto: string; parcelaTexto: string; situacaoTexto: string }
export type GrupoColaborador = {
  id: string; nome: string; cpf: string | null; parcelas: ParcelaFolha[]
  /** Centavos inteiros, para não acumular erro de ponto flutuante. */
  subtotal: number; lancado: number; tudoLancado: boolean; lancadoEm: string | null
}

const reais = (centavos: number) => centavos / 100
const centavos = (valor: number) => Math.round(valor * 100)
const SEM_COLABORADOR = { id: '', nome: 'Sem colaborador', cpf: null }

export const mesDe = (p: ParcelaFolha) => p.competencia.slice(0, 7)
export const somaMes = (mes: string, n: number) => addMonths(`${mes}-01`, n).slice(0, 7)
export const mesPorExtenso = (mes: string) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
export const mesAbreviado = (mes: string) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

export const origemTexto = (p: ParcelaFolha) => (p.multa ? `Multa ${p.multa.auto}${p.multa.placa ? ` · ${p.multa.placa}` : ''}` : 'Termo')
export const parcelaTexto = (p: ParcelaFolha) => `${p.numero}/${p.total}`
export function situacaoTexto(p: ParcelaFolha) {
  if (p.status === 'cancelada') return 'Cancelada'
  if (p.status === 'prevista') return 'Prevista'
  const dia = toDateOnly(p.lancadoEm)
  return dia ? `Lançada em ${dia.slice(8, 10)}/${dia.slice(5, 7)}` : 'Lançada'
}

export function mascararCpf(cpf: string | null) {
  const m = cpf?.match(/^(\d{3})\.?\d{3}\.?\d{3}-?(\d{2})$/)
  return m ? `${m[1]}.***.***-${m[2]}` : ''
}

/** Parcelas do mesmo parcelamento (multa, ou termo do colaborador) ficam na mesma corrente. */
export const chaveOrigem = (p: ParcelaFolha) => p.multa?.id ?? `termo:${p.colaborador?.id ?? ''}:${p.total}`

export function cadeias(todas: ParcelaFolha[]) {
  const mapa = new Map<string, ParcelaFolha[]>()
  for (const p of todas) mapa.set(chaveOrigem(p), [...(mapa.get(chaveOrigem(p)) ?? []), p])
  for (const lista of mapa.values()) lista.sort((a, b) => a.numero - b.numero)
  return mapa
}

const ordemParcela = (a: ParcelaFolha, b: ParcelaFolha) =>
  Number(!!b.multa) - Number(!!a.multa) || (a.multa?.auto ?? '').localeCompare(b.multa?.auto ?? '') || a.numero - b.numero

/** Um grupo por colaborador (ordem alfabética), com as parcelas ordenadas por origem e número. */
export function porColaborador(p: ParcelaFolha[]): GrupoColaborador[] {
  const mapa = new Map<string, ParcelaFolha[]>()
  for (const x of p) mapa.set(x.colaborador?.id ?? '', [...(mapa.get(x.colaborador?.id ?? '') ?? []), x])
  return [...mapa.values()]
    .map((lista) => {
      const c = lista[0].colaborador ?? SEM_COLABORADOR
      const parcelas = [...lista].sort(ordemParcela)
      const lancadas = parcelas.filter((x) => x.status === 'descontada')
      return {
        id: c.id, nome: c.nome, cpf: c.cpf, parcelas,
        subtotal: parcelas.reduce((s, x) => s + centavos(x.valor), 0),
        lancado: lancadas.reduce((s, x) => s + centavos(x.valor), 0),
        tudoLancado: lancadas.length === parcelas.length,
        lancadoEm: lancadas.map((x) => toDateOnly(x.lancadoEm)).filter(Boolean).sort().pop() ?? null,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function linhasDoMes(p: ParcelaFolha[]): LinhaDesconto[] {
  return porColaborador(p).flatMap((g) => g.parcelas.map((x) => ({
    ...x, grupo: `${g.nome} · ${formatMoney(reais(g.subtotal))}`, origemTexto: origemTexto(x), parcelaTexto: parcelaTexto(x), situacaoTexto: situacaoTexto(x),
  })))
}

export function resumo(p: ParcelaFolha[]) {
  return {
    total: reais(p.reduce((s, x) => s + centavos(x.valor), 0)),
    colaboradores: new Set(p.map((x) => x.colaborador?.id ?? '')).size,
    previstas: p.filter((x) => x.status === 'prevista').length,
    lancadas: p.filter((x) => x.status === 'descontada').length,
  }
}

/** Valores em reais; atrasada é prevista de mês anterior ao mês atual. */
export function totaisPorMes(p: ParcelaFolha[], mesAtual: string) {
  const soma = new Map<string, { lancado: number; aLancar: number; atrasada: number }>()
  for (const x of p) {
    const mes = mesDe(x)
    const t = soma.get(mes) ?? { lancado: 0, aLancar: 0, atrasada: 0 }
    const chave = x.status === 'descontada' ? 'lancado' : mes < mesAtual ? 'atrasada' : 'aLancar'
    t[chave] += centavos(x.valor)
    soma.set(mes, t)
  }
  return new Map([...soma].map(([mes, t]) => [mes, { lancado: reais(t.lancado), aLancar: reais(t.aLancar), atrasada: reais(t.atrasada) }]))
}

export const nomeArquivo = (mes: string) => `descontos-folha-${mes}.xlsx`

const dinheiro = (v: number): Celula => ({ valor: v, formato: 'moeda' })

export function planilhaDoMes(p: ParcelaFolha[], mes: string): Planilha {
  const linhas: Celula[][] = []
  for (const g of porColaborador(p)) {
    for (const x of g.parcelas)
      linhas.push([g.nome, g.cpf ?? '', mesBr(x.competencia), x.multa?.auto ?? '', x.multa?.placa ?? '', formatBR(x.multa?.dataInfracao), x.multa?.infracao ?? '', parcelaTexto(x), dinheiro(x.valor), situacaoTexto(x)])
    linhas.push([{ valor: `Subtotal ${g.nome}`, negrito: true }, null, null, null, null, null, null, null, dinheiro(reais(g.subtotal)), null])
  }
  linhas.push([{ valor: 'Total geral', negrito: true }, null, null, null, null, null, null, null, dinheiro(resumo(p).total), null])
  return {
    aba: `Folha ${mes.slice(5, 7)}-${mes.slice(0, 4)}`,
    colunas: [['Colaborador', 28], ['CPF', 16], ['Competência', 13], ['Nº do auto', 14], ['Placa', 10], ['Data da infração', 16], ['Infração', 40], ['Parcela', 9], ['Valor', 14], ['Situação', 18]].map(([titulo, largura]) => ({ titulo: titulo as string, largura: largura as number })),
    linhas,
  }
}
