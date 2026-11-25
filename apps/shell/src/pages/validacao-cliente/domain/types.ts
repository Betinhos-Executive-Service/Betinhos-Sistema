/** Status de `cr40f_validacaoservico.cr40f_status` (valores em `regras.ts`). */
export type StatusValidacao = 'liberado' | 'em_duvida' | 'respondido' | 'aprovado' | 'aprovado_tacito' | 'retirado'
/** Situação na lista: as validações mais os serviços com composição concluída que ainda não foram liberados. */
export type Situacao = 'a_liberar' | StatusValidacao
/** `cr40f_incluirfechamento`: decisão da Juliana no fechamento do mês. */
export type Fechamento = 'pendente' | 'sim' | 'nao'
export type Lado = 'cliente' | 'betinhos'
export type Motivo = 'espera' | 'km_rota' | 'valor' | 'passageiro' | 'outro'

export type Cliente = { id: string; nome: string }

export type ItemComposicao = { item: string; valor: number }

export type Mensagem = {
  id: string
  validacaoId: string
  lado: Lado
  autor: string
  /** Só na primeira mensagem de uma dúvida do cliente. */
  motivo: Motivo | null
  texto: string
  /** ISO. */
  criadaEm: string
}

/** Uma linha da lista: um serviço do cliente com portal, liberado ou não. */
export type Linha = {
  /** Id da validação; `reserva:<id>` quando ainda não foi liberado. */
  id: string
  validacaoId: string | null
  reservaId: string
  /** Código do serviço (`cr40f_id`). */
  codigo: string
  /** Data do serviço, yyyy-mm-dd (America/Sao_Paulo). */
  data: string | null
  trajeto: string
  cliente: Cliente
  /** Centro de resultado da Tenaris (`cr40f_cr`). */
  cr: string
  /** Pedido na Tenaris (`cr40f_idtenaris`). */
  pedido: string
  situacao: Situacao
  valorLiberado: number | null
  /** Valor antes da última mudança de preço (reabre a validação). */
  valorAnterior: number | null
  /** Valor atual da composição de preço. */
  valorComposicao: number | null
  composicao: ItemComposicao[]
  observacao: string
  liberadoEm: string | null
  /** yyyy-mm-dd. */
  prazoTacita: string | null
  aprovadoEm: string | null
  aprovadoPor: string
  fechamento: Fechamento
  ultimaMensagem: Mensagem | null
}

export type Validador = {
  id: string
  nome: string
  email: string
  cliente: Cliente
  ativo: boolean
  ultimoAcesso: string | null
  /** Vazio = ainda não criou a senha no portal (ou a senha foi zerada). */
  senhaDefinidaEm: string | null
  /** `cr40f_aprovador`: aprova os pedidos dos colegas quando o cliente exige aprovação. */
  aprovador: boolean
}

export type NovoValidador = { nome: string; email: string; clienteId: string }

/** Módulos do portal do cliente (`cr40f_portalmodulos`; valores em `config.ts`). */
export type ModuloPortal = 'validar' | 'pedir' | 'meus_servicos'

/** Configuração do portal de um cliente (`cr40f_clientes1`). */
export type PortalConfig = {
  cliente: Cliente
  ligado: boolean
  modulos: ModuloPortal[]
  /** Vazio = só e-mails cadastrados. */
  dominios: string[]
  /** `cr40f_portalexigeaprovacao`: o pedido só chega à Betinhos depois que um aprovador do cliente aprova. */
  exigeAprovacao: boolean
  /** `cr40f_portalantecedenciapedido` e `cr40f_portalprazocancelar` em horas: `null` = padrão (24 h e 12 h), 0 = sem limite. */
  antecedenciaPedidoH: number | null
  prazoCancelarH: number | null
  /** `cr40f_portalcontato`: como falar com a operação; vazio = só "Fale com a Betinhos.". */
  contato: string
  /** O logo do cliente no portal (`cr40f_portallogo`) é lido à parte. */
}
