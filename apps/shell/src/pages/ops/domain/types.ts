import type { ChoiceOption } from '@betinhos/dataverse'

/** Ordem de Pagamento (`cr40f_financeiro`): agrupa serviços faturados juntos e o rateio em pagantes. */
export type Op = {
  id: string
  codigo: string
  status: number | null
  valor: number | null
  /**
   * Soma da composição de preços dos serviços da OP (mesma regra do detalhe); null se algum serviço não tem valor
   * ou se não carregou. O `cr40f_valor` da OP não é preenchido por nenhum processo, então é este que aparece.
   */
  valorServicos?: number | null
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

/** Valor exibido da OP: o próprio, ou a soma dos serviços. */
export const valorOp = (op: Pick<Op, 'valor' | 'valorServicos'>) => op.valor ?? op.valorServicos ?? null

export type OpChoices ={ status: ChoiceOption[]; idioma: ChoiceOption[] }
