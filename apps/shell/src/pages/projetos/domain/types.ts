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
  nome: string
  area: string
  responsavel: string
  /** Pedido do gestor em texto. */
  briefing: string
  instrucoes: string
}

export type Etapa = {
  id: string
  projetoId: string
  /** m de `PRJ-n.m`. */
  numero: number
  codigo: string
  nome: string
  status: number
  descricao: string
  /** `aaaa-mm-dd`; null = sem prazo. */
  prazo: string | null
  /** 0 a 100. */
  andamento: number
  linkPr: string
  /** Data e hora (ISO) em que o workflow Produção publicou; null = ainda não. */
  publicadoProd: string | null
}

/** Quem está usando a tela: só o Renan muda status de etapa. */
export type Perfil = 'renan' | 'gestor'

/** Resumo do projeto derivado das etapas. */
export type Progresso = {
  total: number
  concluidas: number
  /** "1 de 3 concluídas" ou "Sem etapas". */
  rotulo: string
  /** Etapa que resume a situação (atrasada, em validação, em andamento...); null = sem etapas. */
  destaque: Etapa | null
  atrasada: boolean
  /** Menor prazo entre as etapas abertas e não pausadas. */
  proximoPrazo: string | null
}

/** Projeto com o que a lista mostra das etapas e atualizações. */
export type ProjetoLinha = Projeto & { progresso: Progresso; ultimaEm: string | null }
