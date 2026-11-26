import type { Etapa } from './types'

/** Etapa escondida do projeto (guarda a coluna do quadro): a de menor número; null = ainda sem etapa. */
export const etapaDoProjeto = (etapas: Etapa[], projetoId: string): Etapa | null =>
  etapas.filter((e) => e.projetoId === projetoId).sort((a, b) => a.numero - b.numero)[0] ?? null

/** Código da etapa escondida: `PRJ-n.1`. */
export const codigoEtapa1 = (codigoProjeto: string) => (codigoProjeto ? `${codigoProjeto}.1` : '')
