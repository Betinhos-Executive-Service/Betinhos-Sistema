import type { ChoiceOption } from '@betinhos/dataverse'

/** Ordem de Pagamento (`cr40f_financeiro`): agrupa serviços faturados juntos e o rateio em pagantes. */
export type Op = {
  id: string
  codigo: string
  status: number | null
  valor: number | null
  /** Textos montados por flow a partir dos serviços; podem estar defasados. */
  cliente: string
  passageiros: string
  trajetos: string
  primeiroServico: Date | null
  ultimoServico: Date | null
  idioma: number | null
  criadoEm: Date | null
  criadoPor: string
  alteradoEm: Date | null
}

export type OpChoices = { status: ChoiceOption[]; idioma: ChoiceOption[] }
