import { AUTOR, STATUS } from './choices'
import { atrasada, daEtapa, doProjeto, podeConcluir, provas } from './regras'
import type { Atualizacao, Etapa, Perfil } from './types'

/** As 5 fases da trilha, na ordem: Ideia → Fazendo → DEV → PROD → Prova. */
export const FASES = ['Ideia', 'Fazendo', 'DEV', 'PROD', 'Prova'] as const
export type NumFase = 1 | 2 | 3 | 4 | 5

/**
 * Fase da etapa: Ideia = 1, Fazendo = 2, Conferir (DEV) = 3, `cr40f_publicadoprod` preenchido sem Pronto = 4 (PROD),
 * Pronto = 5. Pausado = null (trilha sem destaque).
 */
export function fase(e: Pick<Etapa, 'status' | 'publicadoProd'>): NumFase | null {
  if (e.status === STATUS.pausada) return null
  if (e.status === STATUS.concluida) return 5
  if (e.publicadoProd) return 4
  if (e.status === STATUS.validacao) return 3
  if (e.status === STATUS.andamento) return 2
  return 1
}

export type TomFase = 'ideia' | 'fazendo' | 'dev' | 'prod' | 'ok' | 'vencido'
export type Trilha = { fase: NumFase | null; rotulo: string; tom: TomFase | null; descricao: string }

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Fase atual com o rótulo curto da célula (data, %, "Conferir", "Vencido", "Ideia"/"Brief") e o texto alternativo. */
export function trilha(e: Etapa, atualizacoes: Atualizacao[], hoje: string): Trilha {
  const f = fase(e)
  if (f == null) return { fase: null, rotulo: '', tom: null, descricao: 'Pausado' }
  const itens = daEtapa(atualizacoes, e.id)
  let rotulo: string
  let tom: TomFase
  if (f === 5) { const p = provas(itens)[0]; rotulo = p ? ddmm(p.data) : 'Prova'; tom = 'ok' }
  else if (f === 4) { rotulo = ddmm(e.publicadoProd as string); tom = 'prod' }
  else if (f === 3) { rotulo = 'Conferir'; tom = 'dev' }
  else if (f === 2) { rotulo = `${e.andamento}%`; tom = 'fazendo' }
  else { rotulo = itens.length ? 'Brief' : 'Ideia'; tom = 'ideia' }
  if (f < 5 && atrasada(e, hoje)) { rotulo = 'Vencido'; tom = 'vencido' }
  const descricao = `Fase ${f} de 5, ${FASES[f - 1]}${tom === 'vencido' ? ', prazo vencido' : rotulo !== FASES[f - 1] ? ` (${rotulo})` : ''}`
  return { fase: f, rotulo, tom, descricao }
}

/** Sigla do avatar do autor: R (Renan), G (Gestor), IA (Agente). */
export const siglaAutor = (autor: number) => (autor === AUTOR.renan ? 'R' : autor === AUTOR.agente ? 'IA' : 'G')

/** Motivo do "Concluir" desabilitado; null = pode concluir. */
export function motivoSemConcluir(perfil: Perfil, e: Etapa, atualizacoes: Atualizacao[]): string | null {
  if (e.status === STATUS.concluida) return 'já pronto'
  if (perfil !== 'renan') return 'só o Renan'
  if (!podeConcluir(atualizacoes, e.id)) return 'falta prova'
  return null
}

/** Atualizações do projeto fora de etapa (briefing). */
export const doBriefing = (atualizacoes: Atualizacao[], projetoId: string) => doProjeto(atualizacoes, projetoId).filter((a) => !a.etapaId)
