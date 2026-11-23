import { STATUS } from './choices'
import type { Atualizacao, Etapa, Perfil, Progresso, Projeto } from './types'

/** Provas válidas: atualização marcada como prova e com ao menos um anexo. */
export const provas = (atualizacoes: Atualizacao[]) => atualizacoes.filter((a) => a.prova && a.anexos.length > 0)

/** Atualizações de um projeto, da mais recente para a mais antiga. */
export const doProjeto = (atualizacoes: Atualizacao[], projetoId: string) =>
  atualizacoes.filter((a) => a.projetoId === projetoId).sort((a, b) => b.data.localeCompare(a.data))

/** Atualizações de uma etapa, da mais recente para a mais antiga. */
export const daEtapa = (atualizacoes: Atualizacao[], etapaId: string) =>
  atualizacoes.filter((a) => a.etapaId === etapaId).sort((a, b) => b.data.localeCompare(a.data))

/** Etapas de um projeto em ordem de número. */
export const etapasDo = (etapas: Etapa[], projetoId: string) =>
  etapas.filter((e) => e.projetoId === projetoId).sort((a, b) => a.numero - b.numero)

export const AVISO_SEM_PROVA = 'Para marcar como Concluída, registre antes nesta etapa uma atualização marcada como prova, com ao menos um anexo (print, foto ou vídeo).'
export const AVISO_SO_RENAN = 'Só o Renan muda o status da etapa.'

/** Só a etapa vira Concluída com prova dela mesma (a de outra etapa ou do briefing não conta). */
export const podeConcluir = (atualizacoes: Atualizacao[], etapaId: string) => provas(daEtapa(atualizacoes, etapaId)).length > 0

/**
 * Erro da troca de status (null = permitida). Manter o status atual é sempre permitido; mudar é só do Renan;
 * Concluída exige prova da própria etapa.
 */
export function erroDeStatus(o: { novo: number; atual: number; perfil: Perfil; etapaId: string; atualizacoes: Atualizacao[] }): string | null {
  if (o.novo === o.atual) return null
  if (o.perfil !== 'renan') return AVISO_SO_RENAN
  return o.novo === STATUS.concluida && !podeConcluir(o.atualizacoes, o.etapaId) ? AVISO_SEM_PROVA : null
}

/** Número e código da próxima etapa do projeto: maior número + 1 (`PRJ-n.m`). */
export function proximaEtapa(projeto: Pick<Projeto, 'id' | 'codigo'>, etapas: Etapa[]) {
  const numero = Math.max(0, ...etapas.filter((e) => e.projetoId === projeto.id).map((e) => e.numero)) + 1
  return { numero, codigo: projeto.codigo ? `${projeto.codigo}.${numero}` : '' }
}

/** Aberta: nem concluída nem pausada. */
export const aberta = (e: Pick<Etapa, 'status'>) => e.status !== STATUS.concluida && e.status !== STATUS.pausada

/** Atrasada: tem prazo vencido (antes de `hoje`, `aaaa-mm-dd`) e está aberta. */
export const atrasada = (e: Pick<Etapa, 'prazo' | 'status'>, hoje: string) => e.prazo != null && e.prazo < hoje && aberta(e)

/** Ordem de atenção entre as etapas abertas: em validação (espera o Renan), em andamento, ideia. */
const PESO: Record<number, number> = { [STATUS.validacao]: 0, [STATUS.andamento]: 1, [STATUS.ideia]: 2 }

/**
 * Progresso derivado das etapas. Destaque: a etapa atrasada de prazo mais antigo; senão a aberta que pede mais
 * atenção (em validação, em andamento, ideia; empate pelo número); senão uma pausada; tudo concluído = a última.
 */
export function progresso(etapas: Etapa[], hoje: string): Progresso {
  const total = etapas.length
  const concluidas = etapas.filter((e) => e.status === STATUS.concluida).length
  const rotulo = total ? `${concluidas} de ${total} ${total > 1 ? 'concluídas' : 'concluída'}` : 'Sem etapas'
  const porNumero = [...etapas].sort((a, b) => a.numero - b.numero)
  const abertas = porNumero.filter(aberta)
  const atrasadas = abertas.filter((e) => atrasada(e, hoje)).sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? ''))
  const destaque = atrasadas[0]
    ?? [...abertas].sort((a, b) => (PESO[a.status] ?? 3) - (PESO[b.status] ?? 3))[0]
    ?? porNumero.find((e) => e.status === STATUS.pausada)
    ?? porNumero.at(-1)
    ?? null
  const prazos = abertas.map((e) => e.prazo).filter((p): p is string => p != null).sort()
  return { total, concluidas, rotulo, destaque, atrasada: atrasadas.length > 0, proximoPrazo: prazos[0] ?? null }
}

/** Número de `PRJ-12` / `PRJ-12.3` para ordenar código como número (PRJ-10 depois de PRJ-9). */
export const ordemDoCodigo = (codigo: string) => {
  const m = /^PRJ-(\d+)(?:\.(\d+))?$/.exec(codigo)
  return m ? Number(m[1]) * 100000 + Number(m[2] ?? 0) : null
}

export const hojeIso = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
