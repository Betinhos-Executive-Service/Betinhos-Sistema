import type { Alerta } from './alerts'

export type FieldValue = string | number | boolean | null
export type Lookup = { id: string; label: string }

export type Funcionario = {
  id: string
  values: Record<string, FieldValue>
  veiculo: Lookup | null
  fotoThumb: string | null
  fotoUrl: string | null
  assinaturaUrl: string | null
  loginsesenhas: string | null
  modifiedon: string | null
}

export type FuncionarioView = Funcionario & { alertas: Alerta[] }

export type Draft = {
  values: Record<string, FieldValue>
  veiculo: Lookup | null
}

export type Multa = {
  id: string
  titulo: string
  status: string
  dataHora: string | null
  placa: string
  local: string
}

export type Posse = {
  id: string
  veiculo: string
  inicio: string | null
  fim: string | null
}

export type Anotacao = {
  id: string
  titulo: string
  texto: string
  criadoEm: string
  modificadoEm: string | null
  autor: string
  arquivo: { nome: string; tamanho: number | null; tipo: string | null } | null
}

export type Documento = {
  id: string
  nome: string
  caminho: string
  tamanho: number | null
  modificadoEm: string | null
  mimeType: string | null
}

export type ImageField = 'cr40f_foto' | 'cr40f_assinatura'
