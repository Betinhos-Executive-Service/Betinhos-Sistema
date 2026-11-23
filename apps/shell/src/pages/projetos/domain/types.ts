/** Arquivo anexado (annotation) a uma atualização. */
export type Anexo = { id: string; nome: string; tipo: string; tamanho: number | null }

export type Atualizacao = {
  id: string
  projetoId: string
  /** Data e hora (ISO) em que a atualização aconteceu. */
  data: string
  autor: number
  texto: string
  prova: boolean
  anexos: Anexo[]
}

export type Projeto = {
  id: string
  nome: string
  area: string
  status: number | null
  responsavel: string
  /** `aaaa-mm-dd`; null = sem prazo. */
  prazo: string | null
  /** 0 a 100. */
  andamento: number
  linkPr: string
  instrucoes: string
}

/** Projeto com o que a lista mostra das atualizações. */
export type ProjetoLinha = Projeto & { ultimaEm: string | null; provas: number }
