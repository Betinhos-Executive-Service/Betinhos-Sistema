import type { ChoiceOption } from '@betinhos/dataverse'

/** Uma parcela do rateio de uma Ordem de Pagamento (OP), atribuída a uma pessoa. */
export type Pagante = {
  id: string
  codigo: string
  pessoaId: string
  pessoa: string
  opId: string
  op: string
  valor: number | null
  forma: number | null
  status: number | null
  recibo: number | null
  linkPagamento: string
  linkRecibo: string
  ultimoLembrete: Date | null
  criadoEm: Date | null
  alteradoEm: Date | null
  /** Geração do link Cielo e envio do e-mail; null quando a coluna não existe no ambiente. */
  link: { status: number | null; erro: string }
  email: { status: number | null; erro: string; enviadoEm: Date | null }
}

/** Pessoa de `cr40f_bancodedados` que paga a parcela. */
export type Contato = { nome: string; telefone: string; email: string; cliente: string }

export type ChoiceSet = { status: ChoiceOption[]; forma: ChoiceOption[]; recibo: ChoiceOption[] }

/** Serviço (reserva) faturado na mesma OP. */
export type ServicoOp = { id: string; codigo: string; data: Date | null; destino: string; status: string }
