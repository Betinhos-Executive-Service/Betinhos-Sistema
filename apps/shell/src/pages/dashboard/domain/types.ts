/** Reserva já enriquecida (equivale aos campos `_*` do `enrichReservas` do legado). */
export type Reserva = {
  id: string
  /** Valor bruto de `cr40f_dataehorriodesada` ('' sem data). Usado onde o legado faz `slice` sem fuso. */
  saidaRaw: string
  /** Instante da saída em ms; NaN sem data. */
  saidaMs: number
  /** Dia da saída em Brasília, AAAA-MM-DD ('' sem data). */
  dia: string
  /** Mês da saída em Brasília, AAAA-MM ('' sem data). */
  mes: string
  /** Valor bruto de `createdon` ('' no CSV). */
  criadoRaw: string
  status: number | null
  statusLabel: string
  fatStatus: number | null
  fatStatusLabel: string
  categoriaItem: number | null
  categoriaItemLabel: string
  /** Valor cru do tipo de veículo; vazio = alerta "Sem tipo de veículo". */
  tipoVeiculoRaw: string
  /** Rótulo do tipo de veículo ('—' vazio); é o valor do filtro "Tipo de veículo". */
  tipoVeiculo: string
  veiculoId: string
  motoristaId: string
  motoristaKey: string
  motorista: string
  cliente: string
  cpId: string
  valor: number
  cpPendente: boolean
  cpConcluida: boolean
  opId: string
}
export type Manutencao = { dia: string; valor: number }
export type Multa = { dia: string; status: number | null }
export type Ocorrencia = { dia: string }
export type Funcionario = { statusLabel: string; cnhMs: number }
export type CategoriaVeiculo = 'Propria' | 'Terceirizada' | ''
export type Veiculo = { id: string; statusLabel: string; categoria: CategoriaVeiculo }
export type Conjunto = 'manutencoes' | 'multas' | 'ocorrencias' | 'funcionarios' | 'veiculos'
export type Dados = {
  reservas: Reserva[]
  manutencoes: Manutencao[]
  multas: Multa[]
  ocorrencias: Ocorrencia[]
  funcionarios: Funcionario[]
  veiculos: Veiculo[]
  /** Conjuntos secundários que falharam: os cards deles mostram s/dado. */
  indisponiveis: Conjunto[]
}
export type Atalho = 'hoje' | 'ult7' | 'ult30' | 'esteMes' | 'mesAnt' | 'esteAno' | 'anoAnt' | 'personalizado'
export type Filtros = {
  atalho: Atalho
  inicio: string
  fim: string
  status: string[]
  clientes: string[]
  /** Valores são `motoristaKey`. */
  motoristas: string[]
  tipos: string[]
}
export type Chip = { rotulo: string; tipo: 'valor'; anterior: string; variacao: number } | { rotulo: string; tipo: 'sem-dado' }
export type Apoio = { rotulo: string; texto: string; atencao?: boolean }
export type PontoSerie = { mes: string; rotulo: string; valor: number }
export type KpiId = 'faturamento' | 'servicos' | 'ticket' | 'aReceber' | 'cpPendente' | 'recebimento'
export type Kpi = { id: KpiId; rotulo: string; valor: string; chips: Chip[]; apoio: Apoio[]; serie: PontoSerie[] }
export type Tom = 'ok' | 'warn' | 'danger' | 'neutral'
export type AlertaItem = { id: string; valor: string; rotulo: string; status: string; tom: Tom }
export type CardSecundario = { id: string; rotulo: string; valor: string; apoio: string; atencao: boolean }
