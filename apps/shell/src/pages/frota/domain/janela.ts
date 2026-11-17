import { daysBetween, formatBR } from '../data/dates'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'

/** Janela do encaixe (spec 2026-11-16-manutencoes-v2): um dia, ou uma semana de segunda a domingo. Datas `YYYY-MM-DD`. */
export type ModoJanela = 'dia' | 'semana'
export type Janela = { inicio: string; fim: string }
export type ValoresJanela = { modo: ModoJanela; dia: string; semana: string; comentario: string }
export type ErrosJanela = Partial<Record<'dia' | 'semana' | 'comentario', string>>

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Soma dias no calendário (UTC, sem fuso: só a data). */
export function somarDias(dia: string, dias: number) {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Segunda-feira da semana (seg–dom) do dia. */
export function segundaDe(dia: string) {
  const diaDaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay() // 0 = domingo
  return somarDias(dia, diaDaSemana === 0 ? -6 : 1 - diaDaSemana)
}

export const janelaDoDia = (dia: string): Janela => ({ inicio: dia, fim: dia })

export function semanaDe(dia: string): Janela {
  const inicio = segundaDe(dia)
  return { inicio, fim: somarDias(inicio, 6) }
}

/** Mesma regra de `Ciclo.ValidarJanela` (Cr40f.Frota.Plugin): um dia, ou de segunda a domingo. */
export function janelaValida(j: Janela) {
  if (!DIA.test(j.inicio) || !DIA.test(j.fim)) return false
  if (j.inicio === j.fim) return true
  return segundaDe(j.inicio) === j.inicio && somarDias(j.inicio, 6) === j.fim
}

export const modoDe = (j: Janela): ModoJanela => (j.inicio === j.fim ? 'dia' : 'semana')

/** A semana de hoje e as seguintes: as opções do encaixe por semana. */
export function semanasAPartirDe(hoje: string, quantas: number): Janela[] {
  const primeira = segundaDe(hoje)
  return Array.from({ length: quantas }, (_, i) => semanaDe(somarDias(primeira, i * 7)))
}

export function rotuloJanela(j: Janela) {
  if (j.inicio === j.fim) return formatBR(j.inicio)
  return `Semana de ${formatBR(j.inicio).slice(0, 5)} a ${formatBR(j.fim)}`
}

/** Fim da janela; registro de antes da conversão (plano 5) só tem a data antiga de agendamento. */
export const fimDaJanela = (m: Pick<Manutencao, 'janelaFim' | 'agendarPara'>) => m.janelaFim ?? m.agendarPara

/** Atrasada não é estado: janela vencida (fim antes de hoje) com a manutenção Agendada ou Programada. */
export function atrasada(m: Pick<Manutencao, 'status' | 'janelaFim' | 'agendarPara'>, hoje: string) {
  const fim = fimDaJanela(m)
  return (m.status === MANUT.AGENDADO || m.status === MANUT.PROGRAMADO) && fim !== null && daysBetween(hoje, fim) < 0
}

/**
 * Valores do formulário de encaixe. Com janela gravada e ainda em vigor (termina hoje ou depois), ela; janela já vencida
 * (reagendar uma manutenção atrasada) não volta: abre com hoje, no mesmo modo (dia ou semana), porque a tela recusa
 * janela que terminou antes de hoje.
 */
export function valoresJanelaIniciais(atual: Janela | null, hoje: string, comentario: string | null): ValoresJanela {
  const texto = comentario ?? ''
  if (atual && janelaValida(atual)) {
    if (atual.fim >= hoje) return { modo: modoDe(atual), dia: atual.inicio, semana: segundaDe(atual.inicio), comentario: texto }
    return { modo: modoDe(atual), dia: hoje, semana: segundaDe(hoje), comentario: texto }
  }
  return { modo: 'semana', dia: hoje, semana: segundaDe(hoje), comentario: texto }
}

export type LeituraJanela = { erros: ErrosJanela; janela: Janela | null; comentario: string | null }

/** Janela e comentário prontos para o `cr40f_ManutencaoAgendar`; janela que termina antes de hoje é recusada na tela. */
export function lerJanela(v: ValoresJanela, hoje: string, limiteComentario: number): LeituraJanela {
  const erros: ErrosJanela = {}
  let janela: Janela | null = null
  if (v.modo === 'dia') {
    if (!DIA.test(v.dia)) erros.dia = 'Escolha o dia'
    else janela = janelaDoDia(v.dia)
  } else if (!DIA.test(v.semana)) erros.semana = 'Escolha a semana'
  else janela = semanaDe(v.semana)
  if (janela && janela.fim < hoje) {
    erros[v.modo] = 'A janela não pode terminar antes de hoje'
    janela = null
  }
  const comentario = v.comentario.trim()
  if (comentario.length > limiteComentario) erros.comentario = `Máximo de ${limiteComentario} caracteres`
  if (Object.keys(erros).length) return { erros, janela: null, comentario: null }
  return { erros, janela, comentario: comentario || null }
}
