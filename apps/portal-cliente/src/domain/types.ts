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

/** Módulos do portal habilitados por cliente (`cr40f_clientes1.cr40f_portalmodulos`). */
export type Modulo = 'validar' | 'pedir' | 'meus_servicos'

export type Sessao = { nome: string; email: string; cliente: string; modulos: Modulo[] }

/** `cr40f_status` da reserva visto pelo solicitante. */
export type StatusPedido = 'solicitado' | 'em_analise' | 'confirmado' | 'programado' | 'em_execucao' | 'concluido' | 'cancelado'

export type NovoPedido = {
  passageiros: string[]
  origem: string
  destino: string
  /** ISO da saída. */
  saida: string
  observacao?: string
}

/** Reserva pedida pelo portal (módulos Pedir e Meus serviços). */
export type Pedido = NovoPedido & {
  id: string
  /** Código da reserva (`cr40f_id`); vazio até o Dataverse numerar. */
  numero: string
  status: StatusPedido
  criadoEm: string
  veiculo?: string
  voucherUrl?: string
}
