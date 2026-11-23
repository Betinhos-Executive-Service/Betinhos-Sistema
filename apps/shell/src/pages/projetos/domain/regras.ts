import { STATUS } from './choices'
import type { Atualizacao, Projeto } from './types'

/** Provas válidas: atualização marcada como prova e com ao menos um anexo. */
export const provas = (atualizacoes: Atualizacao[]) => atualizacoes.filter((a) => a.prova && a.anexos.length > 0)

/** Regra do módulo: só vira Concluído com ao menos uma prova (atualização marcada como prova com anexo). */
export const podeConcluir = (atualizacoes: Atualizacao[]) => provas(atualizacoes).length > 0

export const AVISO_SEM_PROVA = 'Para marcar como Concluído, registre antes uma atualização marcada como prova, com ao menos um anexo (print, foto ou vídeo).'

/** Erro da troca de status (null = permitida). Só Concluído tem condição; os demais status são livres. */
export function erroDeStatus(novo: number | null, atualizacoes: Atualizacao[]): string | null {
  return novo === STATUS.concluido && !podeConcluir(atualizacoes) ? AVISO_SEM_PROVA : null
}

/** Atualizações de um projeto, da mais recente para a mais antiga. */
export const doProjeto = (atualizacoes: Atualizacao[], projetoId: string) =>
  atualizacoes.filter((a) => a.projetoId === projetoId).sort((a, b) => b.data.localeCompare(a.data))

export const ultimaAtualizacao = (atualizacoes: Atualizacao[], projetoId: string): Atualizacao | null => doProjeto(atualizacoes, projetoId)[0] ?? null

/** Atrasado: tem prazo vencido (antes de `hoje`, `aaaa-mm-dd`) e não está concluído nem pausado. */
export const atrasado = (p: Pick<Projeto, 'prazo' | 'status'>, hoje: string) =>
  p.prazo != null && p.prazo < hoje && p.status !== STATUS.concluido && p.status !== STATUS.pausado

export const hojeIso = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
