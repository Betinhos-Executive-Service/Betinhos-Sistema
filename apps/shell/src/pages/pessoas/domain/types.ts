import type { ChoiceOption } from '@betinhos/dataverse'

/** Passageiro, solicitante ou contato de cliente (`cr40f_bancodedados`). */
export type Pessoa = {
  id: string
  nome: string
  clienteId: string
  cliente: string
  telefone: string
  email: string
  cargo: number | null
  classificacao: number | null
  idioma: number | null
  status: number | null
  sexo: number | null
  tipoVeiculo: number | null
  departamento: string
  cr: string
  endereco: string
  preferencias: string
  nascimento: string
  cadastro: string
  ultimoServico: string
  foto: string
  criadoEm: Date | null
}

export type ChoiceKey = 'cargo' | 'classificacao' | 'idioma' | 'status' | 'sexo' | 'tipoVeiculo'
export type ChoiceSet = Record<ChoiceKey, ChoiceOption[]>

export type Cliente = { id: string; nome: string }

export type Papel = 'Solicitante' | 'Passageiro'
export type ServicoPessoa = { id: string; codigo: string; data: Date | null; destino: string; status: string; tipo: string; papeis: Papel[] }
export type PagantePessoa = { id: string; codigo: string; op: string; valor: number | null; status: string; criadoEm: Date | null }
/** `limitado`: a pessoa tem mais serviços do que a ficha lê (os mais recentes vieram; total e primeiro ficam "mais de"). */
export type Historico = { servicos: ServicoPessoa[]; pagantes: PagantePessoa[]; limitado?: boolean }
