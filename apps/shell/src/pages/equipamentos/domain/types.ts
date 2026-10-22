/** Equipamento da empresa (`cr40f_equipamento`). */
export type Equipamento = {
  id: string
  descricao: string
  tipoId: string | null
  tipoNome: string
  marcaModelo: string
  numeroSerie: string
  status: number | null
  /** Funcionário com o item; null = escritório/estoque. */
  responsavelId: string | null
  responsavelNome: string
  /** `aaaa-mm-dd` (coluna só data). */
  dataCompra: string | null
  valorCompra: number | null
  observacoes: string
  modificadoEm: Date | null
  /** Caminho no SharePoint da foto de capa; null = sem foto, a lista mostra o ícone do tipo. */
  capa: string | null
}

/** Cadastro de tipos (`cr40f_tipoequipamento`); inativo some dos seletores. */
export type TipoEquipamento = { id: string; nome: string; ativo: boolean }

/** Funcionário que pode ser responsável (`cr40f_funcionarios`). */
export type Pessoa = { id: string; nome: string; ativo: boolean }
