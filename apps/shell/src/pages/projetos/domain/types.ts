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

/** Etapa única e escondida do projeto (número 1): guarda a situação, o "o que falta", o prazo, o PR e a publicação no PROD. */
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

/** Quem está usando a tela: só o Renan muda a situação do projeto. */
export type Perfil = 'renan' | 'gestor'
