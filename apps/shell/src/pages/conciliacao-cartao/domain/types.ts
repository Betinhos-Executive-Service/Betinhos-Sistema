/** Cartão corporativo (`cr40f_cartaocorporativo`): conta do Banco MCP, final e o motorista que o usa na vigência. */
export type Cartao = {
  id: string
  nome: string
  conta: string
  /** Últimos 4 dígitos; vazio = vale para a conta toda. */
  final: string
  motoristaId: string
  motoristaNome: string
  /** `aaaa-mm-dd` (DateOnly). */
  inicio: string | null
  fim: string | null
}

/** Transação do cartão (`cr40f_transacaocartao`) gravada pelo flow diário. */
export type Transacao = {
  id: string
  descricao: string
  conta: string
  fatura: string
  /** `aaaa-mm-dd` (DateOnly, dia da compra em São Paulo). */
  dataCompra: string
  valor: number
  estabelecimento: string
  final: string
  parcela: number | null
  totalParcelas: number | null
  tipo: number | null
  situacao: number | null
  motivo: string
  cartaoId: string
  cartaoNome: string
  motoristaId: string
  motoristaNome: string
  despesaId: string
  despesaNome: string
}

/** Despesa do motorista que pode ser casada com a transação (só o que a tela mostra). */
export type DespesaCandidata = {
  id: string
  nome: string
  protocolo: string
  data: Date | null
  valor: number | null
  estabelecimento: string
}

export type { Pessoa } from '../../equipamentos/domain/types'
