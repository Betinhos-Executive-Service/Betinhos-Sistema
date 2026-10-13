export type Reserva = {
  id: string
  codigo: string
  statusValue: number | null
  status: string
  faturamento: string
  tipoServico: string
  tipoVeiculo: string
  saida: Date | null
  retorno: Date | null
  destino: string
  enderecoSaida: string
  trajeto: string
  obsOperacao: string
  obsInterna: string
  motoristaId: string | null
  motorista: string
  veiculo: string
  cliente: string
  solicitante: string
  passageirosLookup: { id: string; nome: string }[]
  /** Campo VIEW gerado por flow; só é fonte de último recurso. */
  passageirosTexto: string
  veiculoId: string | null
  linkAcompanhamento: string
  linkExpiraEm: Date | null
}

export type Veiculo = { id: string; placa: string; modelo: string; cor: string }

export type Motorista = {
  id: string; nome: string; apelido: string; celular: string
  veiculoAtualId: string | null
  terceiro: boolean
}

export type PassageiroServico = { id: string; ordem: number; nome: string; enderecoSaida: string }

export type OperacionalData = {
  reservas: Reserva[]
  motoristas: Motorista[]
  veiculos: Veiculo[]
  /** Por id de reserva, já em ordem de seleção. */
  passageiros: Record<string, PassageiroServico[]>
  queryMode: 'full' | 'safe'
  /** Falhas parciais que não impedem a tela (listas de apoio indisponíveis). */
  warnings: string[]
}
