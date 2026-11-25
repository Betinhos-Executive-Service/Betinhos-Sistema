import type { Marca } from './marca'

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

/** Prazos do cliente para pedir e cancelar (ver `prazos.ts`). */
export type PrazosSessao = { antecedenciaPedidoH: number; prazoCancelarH: number; contato: string }

export type Sessao = { nome: string; email: string; cliente: string; modulos: Modulo[]; prazos?: PrazosSessao; marca?: Marca; /** Aprova os pedidos do cliente (aba "Para aprovar"). */ aprovador?: boolean }

/** `cr40f_status` da reserva visto pelo solicitante. */
export type StatusPedido = 'solicitado' | 'em_analise' | 'confirmado' | 'programado' | 'em_execucao' | 'concluido' | 'cancelado'

/** Pessoa do pedido (`cr40f_bancodedados`). Sem `id` = cadastro novo. */
/** Sugestão de endereço (TomTom): `rotulo` é o nome do lugar ou da rua; `endereco` o endereço formatado. */
export type EnderecoSugerido = { rotulo: string; endereco: string }

export type PassageiroPedido = { id?: string; nome: string; telefone?: string; email?: string }

export type NovoPedido = {
  passageiros: PassageiroPedido[]
  origem: string
  destino: string
  /** ISO da saída. */
  saida: string
  /** Preferência de veículo (valor da choice `cr40f_tipodeveiculo`); sem valor, a Betinhos escolhe. */
  tipoVeiculo?: number
  observacao?: string
}

/** Reserva pedida pelo portal (módulos Pedir e Meus serviços). */
export type Pedido = Omit<NovoPedido, 'passageiros'> & {
  id: string
  /** Código da reserva (`cr40f_id`); vazio até o Dataverse numerar. */
  numero: string
  status: StatusPedido
  criadoEm: string
  /** Só os nomes, para lista, busca e Excel. */
  passageiros: string[]
  /** Pedido feito por outra pessoa em que o usuário é passageiro: só leitura (não cancela). */
  comoPassageiro?: boolean
  /** Passageiros com id e contato (de Serviços por Passageiro), para repetir o pedido. */
  pessoas: PassageiroPedido[]
  /** Veículo programado pela operação (nome). */
  veiculo?: string
  /** Nome do motorista programado. */
  motorista?: string
  placa?: string
  voucherUrl?: string
  /** Aprovação do cliente: só nos clientes que exigem. Pendente = ainda não chegou à operação. */
  aprovacao?: AprovacaoPedido
  /** Motivo informado por quem recusou (pedido recusado vira cancelado). */
  motivoRecusa?: string
}

export type AprovacaoPedido = 'pendente' | 'aprovado' | 'recusado'

/** Pedido de outro usuário esperando a decisão do aprovador (aba "Para aprovar"). */
export type PedidoParaAprovar = Pick<Pedido, 'id' | 'numero' | 'saida' | 'origem' | 'destino' | 'passageiros' | 'criadoEm' | 'observacao' | 'tipoVeiculo'> & { solicitante: string }

export type DecisaoAprovacao = { decisao: 'aprovar' | 'recusar'; motivo?: string }
