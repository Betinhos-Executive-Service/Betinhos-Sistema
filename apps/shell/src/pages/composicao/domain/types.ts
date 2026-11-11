/** Choice do Dataverse: valor numérico e rótulo formatado (`FormattedValue`). */
export type Opcao = { value: number; label: string }

/** Chaves das colunas de valor (money) da composição, na ordem da tela. */
export const VALOR_KEYS = [
  'valorTotal', 'locacao', 'desvios', 'estacionamento', 'espera', 'adequacao', 'adequacaoKm', 'arco', 'ayrton',
  'diaria', 'horaMotorista', 'passageirosAdicionais', 'rodoanel', 'combustivel', 'passagens', 'pedagios',
] as const
export type ValorKey = (typeof VALOR_KEYS)[number]

/** Composição de Preço (`cr40f_composicaodeprecos`) com as colunas da Reserva relacionada (`cr40f_ServicoRelacionadoGeral`). */
export type Composicao = {
  id: string
  codigo: string
  status: Opcao | null
  valores: Record<ValorKey, number | null>
  criadoEm: Date | null
  modificadoEm: Date | null
  // Da Reserva de Veículos relacionada.
  faturamento: Opcao | null
  statusOperacao: Opcao | null
  saida: Date | null
  motorista: string
  tipoVeiculo: Opcao | null
  servicoId: string
  pax: string
  cliente: string
  trajeto: string
  observacao: string
  cotacao: number | null
  formaPagamento: Opcao | null
  finalizacao: Date | null
  cr: string
}
