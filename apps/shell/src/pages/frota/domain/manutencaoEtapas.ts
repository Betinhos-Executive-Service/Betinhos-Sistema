import { daysBetween, diaSP, formatBR, horaSP } from '../data/dates'
import { brl } from '../data/format'
import { GRAU, LIMITE, MANUT, label } from '../data/schema'
import type { DespesaDaManutencao, DetalheManutencao } from '../data/types'
import { atrasada, fimDaJanela, lerJanela, modoDe, valoresJanelaIniciais, type ValoresJanela } from './janela'

/** Guia da gaveta da manutenção (spec 2026-11-17-manutencoes-gaveta-passo-a-passo): três etapas, um passo por vez. */
export type Etapa = 'agendar' | 'programar' | 'realizar' | 'realizada' | 'reprovada' | 'cancelada'
export type Passo = 'Agendar' | 'Programar' | 'AguardarConclusao'
export type Extra = 'reagendar' | 'reprovar' | 'cancelar' | 'concluir' | 'corrigirClassificacao'
export type Prazo = { rotulo: string; texto: string; perigo: boolean }
export type Situacao = { etapa: Etapa; passo: Passo | null; prazo: Prazo | null; feitos: string[]; extras: Extra[]; atual: number | null }

export const ETAPAS = [
  { chave: 'agendar', rotulo: 'Agendar' }, { chave: 'programar', rotulo: 'Programar' }, { chave: 'realizar', rotulo: 'Realizar' },
] as const

export const textoSaida = (iso: string) => `${formatBR(diaSP(iso))} ${horaSP(iso)}`
const ddmm = (dia: string) => formatBR(dia).slice(0, 5)

function prazoDe(m: DetalheManutencao, etapa: Etapa, hoje: string): Prazo | null {
  if (etapa === 'reprovada' || etapa === 'cancelada') return null
  if (etapa === 'realizada') return { rotulo: 'Valor', texto: brl(m.valor), perigo: false }
  if (atrasada(m, hoje)) return { rotulo: 'Atrasada', texto: `desde ${ddmm(fimDaJanela(m)!)}`, perigo: true }
  if (etapa === 'agendar') {
    const dias = Math.max(0, daysBetween(diaSP(m.criadoEm) ?? hoje, hoje))
    return { rotulo: 'Esperando', texto: `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`, perigo: false }
  }
  if (m.janelaInicio && m.janelaFim) {
    const mesmoMes = m.janelaInicio.slice(0, 7) === m.janelaFim.slice(0, 7)
    const texto = m.janelaInicio === m.janelaFim ? ddmm(m.janelaInicio) : `${mesmoMes ? m.janelaInicio.slice(8, 10) : ddmm(m.janelaInicio)} a ${ddmm(m.janelaFim)}`
    return { rotulo: 'Janela', texto, perigo: false }
  }
  return null
}

function feitosDe(m: DetalheManutencao): string[] {
  const linhas: string[] = []
  if (m.dataAprovacao && m.janelaInicio && m.janelaFim) {
    const janela = { inicio: m.janelaInicio, fim: m.janelaFim }
    // Montado de início/fim (o rotuloJanela começa em maiúscula e não traz o artigo, e outras telas o usam como está).
    const quando = modoDe(janela) === 'dia' ? `o dia ${formatBR(janela.inicio)}` : `a semana de ${ddmm(janela.inicio)} a ${formatBR(janela.fim)}`
    linhas.push(`Agendada em ${formatBR(m.dataAprovacao)} para ${quando} · ${label(GRAU, m.grau)}`)
  } else if (m.agendarPara && !m.janelaInicio && m.status !== MANUT.SOLICITADO && m.status !== MANUT.REPROVADO) {
    linhas.push(`Agendada para ${formatBR(m.agendarPara)} (antes das manutenções v2)`)
  }
  const p = m.programacao
  if (p?.motorista && p.saida && (m.status === MANUT.PROGRAMADO || m.status === MANUT.REALIZADO || m.status === MANUT.CANCELADO)) linhas.push(`Programada: ${p.motorista.label}, saída ${textoSaida(p.saida)}`)
  if (m.status === MANUT.REALIZADO && m.dataManutencao) linhas.push(`Realizada em ${formatBR(diaSP(m.dataManutencao))}`)
  if (m.status === MANUT.REPROVADO) linhas.push(m.comentarioAprovador ? `Reprovada: ${m.comentarioAprovador}` : 'Reprovada')
  if (m.status === MANUT.CANCELADO) linhas.push(m.comentarioAprovador ? `Cancelada: ${m.comentarioAprovador}` : 'Cancelada')
  return linhas
}

export function avaliar(m: DetalheManutencao, hoje: string): Situacao {
  let etapa: Etapa
  let passo: Passo | null = null
  let extras: Extra[] = []
  let atual: number | null
  switch (m.status) {
    case MANUT.AGENDADO: etapa = 'programar'; passo = 'Programar'; extras = ['reagendar', 'cancelar', 'concluir']; atual = 1; break
    case MANUT.PROGRAMADO: etapa = 'realizar'; passo = 'AguardarConclusao'; extras = ['concluir', 'reagendar', 'cancelar']; atual = 2; break
    case MANUT.REALIZADO: etapa = 'realizada'; extras = ['corrigirClassificacao']; atual = null; break
    case MANUT.REPROVADO: etapa = 'reprovada'; atual = 0; break
    case MANUT.CANCELADO: etapa = 'cancelada'; atual = m.programacao?.motorista ? 2 : m.janelaInicio ? 1 : 0; break
    default: etapa = 'agendar'; passo = 'Agendar'; extras = ['reprovar', 'cancelar', 'concluir']; atual = 0
  }
  return { etapa, passo, prazo: prazoDe(m, etapa, hoje), feitos: feitosDe(m), extras, atual }
}

const ROTULO_EXTRA: Record<Extra, string> = { reagendar: 'Reagendar', reprovar: 'Reprovar', cancelar: 'Cancelar manutenção', concluir: 'Já foi feita: concluir', corrigirClassificacao: 'Corrigir classificação' }
export const rotuloExtra = (extra: Extra, etapa: Etapa) => (extra === 'concluir' && etapa === 'realizar' ? 'Concluir por ele' : ROTULO_EXTRA[extra])

export type ValoresAgendar = ValoresJanela & { grau: number | null }
export const valoresAgendarIniciais = (m: DetalheManutencao, hoje: string): ValoresAgendar => ({
  ...valoresJanelaIniciais(m.janelaInicio && m.janelaFim ? { inicio: m.janelaInicio, fim: m.janelaFim } : null, hoje, m.comentarioAoMotorista), grau: m.grau,
})

export function lerAgendar(v: ValoresAgendar, hoje: string) {
  const leitura = lerJanela(v, hoje, LIMITE.comentarioAoMotorista)
  const erros: Partial<Record<'grau' | 'dia' | 'semana' | 'comentario', string>> = { ...leitura.erros }
  if (v.grau === null) erros.grau = 'Escolha o grau'
  if (Object.keys(erros).length || !leitura.janela || v.grau === null) return { erros, pedido: null }
  return { erros, pedido: { inicio: leitura.janela.inicio, fim: leitura.janela.fim, comentario: leitura.comentario, grau: v.grau } }
}

export type ValoresProgramar = { motoristaId: string | null; saida: string }
export function lerProgramar(v: ValoresProgramar, m: Pick<DetalheManutencao, 'janelaInicio' | 'janelaFim'>) {
  const erros: Partial<Record<'motorista' | 'saida', string>> = {}
  if (!v.motoristaId) erros.motorista = 'Escolha o motorista'
  const data = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.saida) ? new Date(`${v.saida}:00-03:00`) : null
  if (!data || Number.isNaN(data.getTime())) erros.saida = 'Informe a data e hora de saída'
  if (Object.keys(erros).length || !data) return { erros, saidaIso: null, foraDaJanela: false }
  const dia = v.saida.slice(0, 10)
  const foraDaJanela = !!m.janelaInicio && !!m.janelaFim && (dia < m.janelaInicio || dia > m.janelaFim)
  return { erros, saidaIso: data.toISOString(), foraDaJanela }
}

const ANEXO_COMPLETO = 100000002
const OPERACIONAL: Record<number, string> = { 100000000: 'Em conferência', 100000001: 'Precisa corrigir', 100000002: 'Conferida', 100000003: 'Recusada', 100000004: 'Cancelada' }
export const textoDespesa = (d: DespesaDaManutencao) => (d.statusAnexo !== ANEXO_COMPLETO ? 'Aguardando a nota' : OPERACIONAL[d.statusOperacional ?? -1] ?? 'Em conferência')
