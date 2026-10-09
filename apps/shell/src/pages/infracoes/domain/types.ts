/** Item do catálogo de infrações do CTB (`cr40f_infracaodetransito`). */
export type Infracao = {
  id: string
  codigo: string
  descricao: string
  enquadramento: string
  gravidade: number | null
  pontos: number | null
  valor: number | null
  /** Multi-choice: pode ter mais de uma competência. */
  competencia: number[]
  responsabilidade: number | null
  ativo: boolean
  modificadoEm: Date | null
}

/** Multa que usa a infração (só o necessário para a ficha). */
export type MultaUso = {
  id: string
  infracaoId: string
  titulo: string
  status: string
  data: Date | null
  placa: string
  motorista: string
}
