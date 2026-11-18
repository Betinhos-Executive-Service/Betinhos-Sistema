import type { Celula, Planilha } from '../../../lib/xlsx'
import { addMonths, formatBR, toDateOnly } from '../../frota/data/dates'
import type { ParcelaFolha } from '../../frota/data/types'
import { mesBr } from '../../frota/domain/multaEtapas'

export type GrupoColaborador = { id: string; nome: string; cpf: string | null; parcelas: ParcelaFolha[]; subtotal: number }

export const SEM_COLABORADOR = { id: '', nome: 'Sem colaborador', cpf: null }

export const mesDe = (p: ParcelaFolha) => p.competencia.slice(0, 7)
export const somaMes = (mes: string, n: number) => addMonths(`${mes}-01`, n).slice(0, 7)
const nomeDoMes = (mes: string, opcoes: Intl.DateTimeFormatOptions) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1).toLocaleDateString('pt-BR', opcoes)
export const mesPorExtenso = (mes: string) => nomeDoMes(mes, { month: 'long', year: 'numeric' })
export const mesAbreviado = (mes: string) => nomeDoMes(mes, { month: 'short' }).replace('.', '')

/** Soma em centavos inteiros, para não acumular erro de ponto flutuante. */
export const somaValores = (p: ParcelaFolha[]) => p.reduce((s, x) => s + Math.round(x.valor * 100), 0) / 100
export const motivoTexto = (p: ParcelaFolha) =>
  `${p.multa ? `Multa ${p.multa.placa ?? p.multa.auto}` : 'Termo'} · ${p.total === 1 ? 'à vista' : `parcela ${p.numero} de ${p.total}`}`
export function situacaoTexto(p: ParcelaFolha) {
  if (p.status === 'cancelada') return 'Cancelada'
  if (p.status === 'prevista') return 'Prevista'
  const dia = toDateOnly(p.lancadoEm)
  return dia ? `Lançada em ${dia.slice(8, 10)}/${dia.slice(5, 7)}` : 'Lançada'
}

export type EstadoParcela = 'lancada' | 'cancelada' | 'atrasada' | 'futura'
/** Prevista de mês anterior ao atual está atrasada; do mês atual em diante, a lançar. */
export function estadoParcela(p: ParcelaFolha, mesAtual: string): EstadoParcela {
  if (p.status === 'descontada') return 'lancada'
  if (p.status === 'cancelada') return 'cancelada'
  return mesDe(p) < mesAtual ? 'atrasada' : 'futura'
}

/** Parcelas do mesmo parcelamento (multa, ou termo do colaborador) ficam na mesma corrente. */
export const chaveOrigem = (p: ParcelaFolha) => p.multa?.id ?? `termo:${p.termoId ?? `${p.colaborador?.id ?? ''}:${p.total}`}`

export function cadeias(todas: ParcelaFolha[]) {
  const mapa = new Map<string, ParcelaFolha[]>()
  for (const p of todas) {
    const k = chaveOrigem(p)
    const lista = mapa.get(k)
    if (lista) lista.push(p)
    else mapa.set(k, [p])
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.numero - b.numero)
  return mapa
}

const ordemParcela = (a: ParcelaFolha, b: ParcelaFolha) =>
  Number(!!b.multa) - Number(!!a.multa) || (a.multa?.auto ?? '').localeCompare(b.multa?.auto ?? '') || a.numero - b.numero

/** Um grupo por colaborador (ordem alfabética), com as parcelas ordenadas por origem e número. */
export function porColaborador(p: ParcelaFolha[]): GrupoColaborador[] {
  const mapa = new Map<string, ParcelaFolha[]>()
  for (const x of p) {
    const k = x.colaborador?.id ?? ''
    const lista = mapa.get(k)
    if (lista) lista.push(x)
    else mapa.set(k, [x])
  }
  return [...mapa.values()]
    .map((lista) => {
      const c = lista[0].colaborador ?? SEM_COLABORADOR
      const parcelas = [...lista].sort(ordemParcela)
      return {
        id: c.id, nome: c.nome, cpf: c.cpf, parcelas,
        subtotal: somaValores(parcelas),
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export const nomeArquivo = (mes: string) => `descontos-folha-${mes}.xlsx`

const dinheiro = (v: number): Celula => ({ valor: v, formato: 'moeda' })

export function planilhaDoMes(p: ParcelaFolha[], mes: string): Planilha {
  const linhas: Celula[][] = []
  for (const g of porColaborador(p)) {
    for (const x of g.parcelas)
      linhas.push([g.nome, g.cpf ?? '', mesBr(x.competencia), x.multa?.auto ?? '', x.multa?.placa ?? '', formatBR(x.multa?.dataInfracao), x.multa?.infracao ?? '', `${x.numero}/${x.total}`, dinheiro(x.valor), situacaoTexto(x)])
    linhas.push([{ valor: `Subtotal ${g.nome}`, negrito: true }, null, null, null, null, null, null, null, dinheiro(g.subtotal), null])
  }
  linhas.push([{ valor: 'Total geral', negrito: true }, null, null, null, null, null, null, null, dinheiro(somaValores(p)), null])
  return {
    aba: `Folha ${mes.slice(5, 7)}-${mes.slice(0, 4)}`,
    colunas: [
      { titulo: 'Colaborador', largura: 28 }, { titulo: 'CPF', largura: 16 }, { titulo: 'Competência', largura: 13 }, { titulo: 'Nº do auto', largura: 14 },
      { titulo: 'Placa', largura: 10 }, { titulo: 'Data da infração', largura: 16 }, { titulo: 'Infração', largura: 40 }, { titulo: 'Parcela', largura: 9 },
      { titulo: 'Valor', largura: 14 }, { titulo: 'Situação', largura: 18 },
    ],
    linhas,
  }
}
