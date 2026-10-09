import type { ChoiceOption } from '@betinhos/dataverse'

/** Despesa Operacional (`cr40f_despesaoperacional`): gasto lançado pelo motorista no App Motoristas. */
export type Despesa = {
  id: string
  nome: string
  data: Date | null
  valor: number | null
  estabelecimento: string
  categoriaId: string
  categoria: string
  formaId: string
  forma: string
  motoristaId: string
  motorista: string
  veiculoId: string
  veiculo: string
  reservaId: string
  reserva: string
  manutencaoId: string
  manutencao: string
  cidade: string
  statusOperacional: number | null
  statusFinanceiro: number | null
  statusAnexo: number | null
  origem: number | null
  km: number | null
  litros: number | null
  observacao: string
  observacaoInterna: string
  protocolo: string
  possivelDuplicidade: boolean
  latitude: number | null
  longitude: number | null
  criadoEm: Date | null
  criadoPor: string
  alteradoEm: Date | null
  alteradoPor: string
}

/** Comprovante (`cr40f_anexodespesaoperacional`): arquivo no OneDrive/SharePoint, só o link fica no Dataverse. */
export type Anexo = {
  id: string
  nome: string
  tipo: number | null
  status: number | null
  url: string | null
  enviadoEm: Date | null
  enviadoPor: string
}

export type DespesaChoices = {
  operacional: ChoiceOption[]
  financeiro: ChoiceOption[]
  anexo: ChoiceOption[]
  origem: ChoiceOption[]
  anexoTipo: ChoiceOption[]
  anexoStatus: ChoiceOption[]
}
