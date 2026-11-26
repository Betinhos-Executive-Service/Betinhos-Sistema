import { STATUS } from './choices'
import type { Atualizacao, Etapa, Perfil } from './types'

/** Provas válidas: atualização marcada como prova e com ao menos um anexo. */
export const provas = (atualizacoes: Atualizacao[]) => atualizacoes.filter((a) => a.prova && a.anexos.length > 0)

/** Atualizações de um projeto, da mais recente para a mais antiga. */
export const doProjeto = (atualizacoes: Atualizacao[], projetoId: string) =>
  atualizacoes.filter((a) => a.projetoId === projetoId).sort((a, b) => b.data.localeCompare(a.data))

/** Atualizações de uma etapa, da mais recente para a mais antiga. */
export const daEtapa = (atualizacoes: Atualizacao[], etapaId: string) =>
  atualizacoes.filter((a) => a.etapaId === etapaId).sort((a, b) => b.data.localeCompare(a.data))

/** Etapa que a tela usa do projeto: a de menor número (dado antigo com mais de uma: as outras são ignoradas); null = ainda sem etapa. */
export const etapaDoProjeto = (etapas: Etapa[], projetoId: string): Etapa | null =>
  etapas.filter((e) => e.projetoId === projetoId).sort((a, b) => a.numero - b.numero)[0] ?? null

/** Código da etapa única: `PRJ-n.1`. */
export const codigoEtapa1 = (codigoProjeto: string) => (codigoProjeto ? `${codigoProjeto}.1` : '')

export const AVISO_SEM_PROVA = 'Para marcar como Pronto, registre antes uma atualização marcada como prova, com ao menos um anexo (print, foto ou vídeo).'
export const AVISO_SO_RENAN = 'Só o Renan muda a situação do projeto.'

/** Só vira Pronto (Concluída) com prova da própria etapa (a de outra etapa ou do briefing não conta). */
export const podeConcluir = (atualizacoes: Atualizacao[], etapaId: string) => provas(daEtapa(atualizacoes, etapaId)).length > 0

/**
 * Erro da troca de situação (null = permitida). Manter a atual é sempre permitido; mudar é só do Renan;
 * Concluída exige prova da própria etapa.
 */
export function erroDeStatus(o: { novo: number; atual: number; perfil: Perfil; etapaId: string; atualizacoes: Atualizacao[] }): string | null {
  if (o.novo === o.atual) return null
  if (o.perfil !== 'renan') return AVISO_SO_RENAN
  return o.novo === STATUS.concluida && !podeConcluir(o.atualizacoes, o.etapaId) ? AVISO_SEM_PROVA : null
}

/** Aberta: nem concluída nem pausada. */
export const aberta = (e: Pick<Etapa, 'status'>) => e.status !== STATUS.concluida && e.status !== STATUS.pausada

/** Atrasada: tem prazo vencido (antes de `hoje`, `aaaa-mm-dd`) e está aberta. */
export const atrasada = (e: Pick<Etapa, 'prazo' | 'status'>, hoje: string) => e.prazo != null && e.prazo < hoje && aberta(e)

/** Número de `PRJ-12` para ordenar código como número (PRJ-10 depois de PRJ-9). */
export const ordemDoCodigo = (codigo: string) => {
  const m = /^PRJ-(\d+)(?:\.(\d+))?$/.exec(codigo)
  return m ? Number(m[1]) * 100000 + Number(m[2] ?? 0) : null
}

export const hojeIso = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
