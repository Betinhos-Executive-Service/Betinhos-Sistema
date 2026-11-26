import type { ChecklistItem } from './checklist'

/** Arquivo anexado (annotation) a uma atualização. */
export type Anexo = { id: string; nome: string; tipo: string; tamanho: number | null }

export type Atualizacao = {
  id: string
  projetoId: string
  /** null = briefing ou comentário do projeto (fora de etapa). */
  etapaId: string | null
  /** Data e hora (ISO) em que a atualização aconteceu. */
  data: string
  autor: number
  texto: string
  prova: boolean
  /** Texto do áudio anexado, gravado pelo plugin de transcrição; '' = pendente. */
  transcricao: string
  anexos: Anexo[]
}

export type Projeto = {
  id: string
  /** `PRJ-n`, autonumber do Dataverse. */
  codigo: string
  /** Título. */
  nome: string
  /** Descrição (coluna `cr40f_briefing`). */
  briefing: string
  checklist: ChecklistItem[]
}

/** Etapa escondida do projeto (número 1): guarda a coluna do quadro (status); os outros campos são dos agentes e a tela não mostra. */
export type Etapa = {
  id: string
  projetoId: string
  /** m de `PRJ-n.m`. */
  numero: number
  codigo: string
  nome: string
  status: number
  /** `aaaa-mm-dd`; null = sem prazo. */
  prazo: string | null
  /** 0 a 100. */
  andamento: number
  linkPr: string
  /** Data e hora (ISO) em que o workflow Produção publicou; null = ainda não. */
  publicadoProd: string | null
}

/** Quem está usando a tela: define o autor gravado nos anexos. */
export type Perfil = 'renan' | 'gestor'
