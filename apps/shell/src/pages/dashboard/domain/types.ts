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
  /** Rótulo de `cr40f_tipodoservico` ('—' vazio), o `_tipoL` do legado. */
  tipoServico: string
  /** Valor bruto de `new_datadefinalizacao` ('' sem data). */
  finalizadoRaw: string
}
/**
 * `dia`, `aprovacaoDia` e `criadoDia` (`createdon`) em Brasília; `tipoReparo` é o rótulo de `cr40f_tipodoreparo` ('—' vazio).
 * `dataMs` (`cr40f_datamanutencao`) e `criadoMs` (`createdon`) são os instantes crus (NaN sem data), para o prazo do `daysBetweenValues`.
 */
export type Manutencao = {
  dia: string; valor: number; aprovacaoDia: string; statusLabel: string; tipoReparo: string; veiculoId: string; criadoDia: string
  dataMs: number; criadoMs: number
}
/** `motorista` é o apelido do funcionário (via id) ou o rótulo do lookup ('—'); infração pelo `$expand`, código cai no rótulo do lookup. */
export type Multa = {
  dia: string; status: number | null; statusLabel: string; motoristaId: string; motorista: string; veiculoId: string; infracaoCodigo: string; infracaoDescricao: string
}
export type Ocorrencia = { dia: string }
/** `funcao` é o rótulo ('—' vazio); `empresa` é o rótulo bruto de `cr40f_nomedaempresa` ('' vazio). */
export type Funcionario = { id: string; nome: string; apelido: string; statusLabel: string; cnhMs: number; funcao: string; empresa: string }
/** 'Aluguel' é o código 100000002 de `new_categoriadoveiculo` (o legado não o trata; regra da Fix round 1 da Task 1). */
export type CategoriaVeiculo = 'Propria' | 'Terceirizada' | 'Aluguel' | ''
export type Veiculo = {
  id: string; statusLabel: string; categoria: CategoriaVeiculo; placa: string; marca: string; modelo: string; blindado: boolean; ano: number | null
}
/** Viagem do Infleet. `mes` é o texto bruto `slice(0, 7)` (sem fuso, como o legado); `dia` é o dia em Brasília. Numéricos: `numberValue` (0 sem dado). */
export type Viagem = {
  dia: string; mes: string; veiculoId: string; motoristaId: string; distancia: number
  velocidadeMedia: number; velocidadeMaxima: number; combustivelL: number; custoCombustivel: number
}
/** Evento do Infleet. `tipo` é o `new_slug` bruto; o score o normaliza (`trim().toLowerCase()`). `descricao` (`new_descricao`) entra na classificação por texto da Frota. */
export type EventoConducao = { dia: string; mes: string; motoristaId: string; tipo: string; veiculoId: string; descricao: string; velocidade: number; limite: number }
/** Telemetria diária do Infleet por veículo. Numéricos: `numberValue` (0 sem dado). */
export type TelemetriaDia = {
  dia: string; mes: string; veiculoId: string; ociosoMin: number
  distanciaKm: number; velocidadeMedia: number; velocidadeMaxima: number; excessos: number; autonomia: number; tempoAcimaMin: number
}
/** Pagante (`cr40f_pagantes`). Rótulos de forma/status com '—' vazio; `criadoDia` em Brasília. */
export type Pagante = {
  id: string; opId: string; pessoaId: string; pessoa: string; valor: number
  forma: number | null; formaLabel: string; status: number | null; statusLabel: string
  criadoRaw: string; criadoDia: string; primeiroPagamentoRaw: string
}
/**
 * Linha do `buildExpenseRows` do legado: categoria/forma pelos cadastros, motorista pelo nome completo e empresa normalizada (BETINHOS/DEPAULA).
 * `dia` é o texto bruto `slice(0, 10)` de `cr40f_datagasto` (o `dateKey` do legado, usado no filtro de período); `mes` é o mês em
 * Brasília (o `mK` do legado, usado nas séries mensais) e pode diferir de `dia.slice(0, 7)` na virada do mês (gasto após 21h do último dia).
 */
export type Despesa = {
  id: string; dia: string; mes: string; valor: number
  categoriaId: string; categoria: string; formaId: string; forma: string; empresa: string
  motoristaId: string; motorista: string; reservaId: string
  statusFinanceiro: number | null; statusAnexo: number | null; anexos: number; descricao: string
}
export type CategoriaDespesa = { id: string; nome: string; grupoDre: string }
export type FormaPagamento = { id: string; nome: string }
export type Conjunto = 'manutencoes' | 'multas' | 'ocorrencias' | 'funcionarios' | 'veiculos' | 'viagens' | 'eventos' | 'telemetria' | 'pagantes' | 'despesas'
export type Dados = {
  reservas: Reserva[]
  manutencoes: Manutencao[]
  multas: Multa[]
  ocorrencias: Ocorrencia[]
  funcionarios: Funcionario[]
  veiculos: Veiculo[]
  viagens: Viagem[]
  eventos: EventoConducao[]
  telemetria: TelemetriaDia[]
  pagantes: Pagante[]
  /** Despesas da janela; `despesas` em `indisponiveis` quando qualquer tabela de despesa falha (todas vazias). */
  despesas: Despesa[]
  categoriasDespesa: CategoriaDespesa[]
  formasPagamento: FormaPagamento[]
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
