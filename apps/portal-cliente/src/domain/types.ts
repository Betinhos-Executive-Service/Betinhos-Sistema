export type Status = 'liberado' | 'em_duvida' | 'respondido' | 'aprovado' | 'aprovado_tacito'

export type Motivo = 'espera' | 'km_rota' | 'valor' | 'passageiro' | 'outro'

export type LinhaPreco = { rotulo: string; valor: number }

export type Mensagem = {
  id: string
  lado: 'cliente' | 'betinhos'
  autor: string
  texto: string
  /** Só na mensagem que abre a dúvida. */
  motivo?: Motivo
  criadaEm: string
}

export type Servico = {
  id: string
  numero: string
  /** Id do pedido no sistema do cliente (cr40f_idtenaris). */
  pedidoCliente: string
  cr: string
  saida: string
  origem: string
  destino: string
  /** Só o nome: telefone e e-mail do passageiro não saem do Dataverse. */
  passageiros: string[]
  solicitante: string
  veiculo: string
  status: Status
  liberadoEm: string
  /** Último dia (yyyy-mm-dd, America/Sao_Paulo) antes da aprovação tácita. */
  prazoTacito: string
  valorTotal: number
  /** Valor antes da última mudança de preço, quando o serviço voltou para reaprovar. */
  valorAnterior?: number
  composicao: LinhaPreco[]
  observacao?: string
  voucherUrl?: string
  mensagens: Mensagem[]
  aprovadoPor?: string
  aprovadoEm?: string
}

export type Sessao = { nome: string; email: string; cliente: string }
