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
  /** Aditivo de assinatura eletrônica (coluna de arquivo); só vem no `get`. */
  aditivo?: { nome: string; url: string } | null
  modifiedon: string | null
  /** Motorista sem acesso ao app (selo "Sem app" na lista); ausente quando não foi possível consultar. */
  semApp?: boolean
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

/** Equipamento com o funcionário (aba da ficha; o cadastro fica em #/equipamentos). */
export type EquipamentoResumo = {
  id: string
  descricao: string
  tipo: string
  numeroSerie: string
  /** Valor do choice `cr40f_status` (rótulo e tom vêm de equipamentos/domain/choices). */
  status: number | null
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
