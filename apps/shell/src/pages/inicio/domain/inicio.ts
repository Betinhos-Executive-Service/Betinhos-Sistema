import type { Comunicado, Destino, Estado, Indicador, Noticia, Prazo, Prioridade, ServicoAReceber, Tarefa, Tom } from './types'

// Regras da Página Inicial, portadas do WebResource `cr40f_HomeBetinhos` (repo home-betinhos, src/lib/dataverse.ts).
// Funções puras: recebem as linhas cruas da Web API e o "agora"; toda IO fica em data/.

type Row = Record<string, unknown>

const FUSO = 'America/Sao_Paulo'
const FMT = '@OData.Community.Display.V1.FormattedValue'

const texto = (value: unknown) => String(value ?? '')
export const normalizarId = (value: unknown) => texto(value).replace(/[{}]/g, '').toLowerCase()
const lookupNome = (row: Row, campo: string) => texto(row[`_${campo}_value${FMT}`] || row[`_${campo}_value`])
const tituloDe = (row: Row, fallback: string) => texto(row.cr40f_titulo || row.cr40f_name || row.cr40f_codigo || row.cr40f_id) || fallback

export const RESERVAS: Destino = { rota: 'geral' }
export const PLANNER: Destino = { rota: 'planner' }
export const FLUXO_CAIXA: Destino = { rota: 'cr40f_telafluxodecaixa' }

/** Data `AAAA-MM-DD` no fuso de São Paulo. */
export function diaSaoPaulo(now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function comunicadoDeLinha(row: Row): Comunicado {
  const p = Number(row.cr40f_prioridade)
  return { id: texto(row.cr40f_comunicadohomeid), titulo: texto(row.cr40f_titulo), corpo: texto(row.cr40f_conteudo), prioridade: p === 100000002 ? 'critical' : p === 100000001 ? 'attention' : 'info' }
}

export function prazoDaTarefa(value: unknown, now: Date): { prazo: Prazo; prazoLabel: string } {
  const dia = texto(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { prazo: 'outro', prazoLabel: 'Sem prazo' }
  const diff = Math.floor((new Date(`${dia}T12:00:00Z`).getTime() - new Date(`${diaSaoPaulo(now)}T12:00:00Z`).getTime()) / 86400000)
  if (diff < 0) return { prazo: 'atrasada', prazoLabel: diff === -1 ? 'Venceu ontem' : `${Math.abs(diff)} dias atrasada` }
  if (diff === 0) return { prazo: 'hoje', prazoLabel: 'Vence hoje' }
  return { prazo: 'outro', prazoLabel: 'Próximo prazo' }
}

export const prioridadeDaTarefa = (value: number): Prioridade => value === 100000003 ? 'Crítica' : value === 100000002 ? 'Alta' : 'Normal'

export function estadoDaTarefa(status: number, prioridade: number): Estado {
  if (status === 100000002 || prioridade === 100000003) return 'Crítico'
  if (status === 100000001 || prioridade === 100000002) return 'Atenção'
  return 'Novo'
}

/**
 * Tarefas abertas do Planner com os usuários (systemuser) responsáveis: o responsável principal e os da tabela de
 * responsáveis, traduzidos de funcionário para usuário. É o que o filtro "Minhas" compara com o usuário logado.
 */
export function montarTarefas(tarefas: Row[], responsaveis: Row[], funcionarios: Row[], now: Date): Tarefa[] {
  const usuarioDoFuncionario = new Map(funcionarios.map((row) => [normalizarId(row.cr40f_funcionariosid), normalizarId(row._cr40f_usuariodataverse_value)]))
  const porTarefa = new Map<string, string[]>()
  for (const row of responsaveis) {
    const tarefa = normalizarId(row._cr40f_tarefa_value)
    const usuario = usuarioDoFuncionario.get(normalizarId(row._cr40f_funcionario_value))
    if (tarefa && usuario) porTarefa.set(tarefa, [...(porTarefa.get(tarefa) ?? []), usuario])
  }
  return tarefas.map((row) => {
    const id = texto(row.cr40f_plannertarefaid)
    const principal = usuarioDoFuncionario.get(normalizarId(row._cr40f_cr40f_funcionarioresponsavel_value)) ?? ''
    return {
      id,
      titulo: texto(row.cr40f_titulo) || 'Tarefa sem título',
      responsaveis: [...new Set([...(porTarefa.get(normalizarId(id)) ?? []), principal].filter(Boolean))],
      prioridade: prioridadeDaTarefa(Number(row.cr40f_prioridade)),
      estado: estadoDaTarefa(Number(row.cr40f_status), Number(row.cr40f_prioridade)),
      ...prazoDaTarefa(row.cr40f_prazo, now),
    }
  })
}

/** "Minhas" filtra pelo usuário logado; sem usuário conhecido, "Minhas" fica vazia (como no legado). */
export function tarefasVisiveis(tarefas: Tarefa[], escopo: 'todas' | 'minhas', usuarioId: string) {
  if (escopo === 'todas') return tarefas
  const eu = normalizarId(usuarioId)
  return eu ? tarefas.filter((t) => t.responsaveis.includes(eu)) : []
}

const TEMAS = ['Mobilidade', 'Operação', 'Cliente']
const RELEVANCIAS: Prioridade[] = ['Normal', 'Alta', 'Crítica']

export function noticiaDeLinha(row: Row): Noticia {
  return {
    id: texto(row.cr40f_noticiaexternaid),
    titulo: texto(row.cr40f_titulo),
    resumo: texto(row.cr40f_resumo),
    url: texto(row.cr40f_urlcompleta) || texto(row.cr40f_url),
    fonte: lookupNome(row, 'cr40f_fonte') || 'Fonte homologada',
    tema: TEMAS[Number(row.cr40f_tema) - 100000000] ?? 'Operação',
    prioridade: RELEVANCIAS[Number(row.cr40f_relevancia) - 100000000] ?? 'Normal',
    publicadoEm: texto(row.cr40f_publicado_em),
  }
}

/** Só http(s): o resumo e a URL vêm de fontes externas. */
export const urlSegura = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined)

/** Resumo das notícias chega com HTML; a tela mostra só o texto. */
export function textoPlano(value: string) {
  return new DOMParser().parseFromString(value, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export function diasUteisAteFimDoMes(from: Date) {
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const fim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  let total = 0
  while (cursor <= fim) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) total += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return total
}

// Série consolidada e fórmula de meta validadas no Dashboard Betinhos.
const RECEITA_HISTORICA: Record<number, readonly number[]> = {
  2023: [148127.05, 218779.86, 344114.51, 280122.75, 363727.08, 298182.52, 282676.23, 434144.06, 314675.09, 365644.26, 366559.39, 281865.47],
  2024: [213816.57, 301775.6, 431967.33, 375306.13, 368946.6, 351496.37, 296388.78, 476702.85, 401841.79, 553994.72, 413078.59, 330595.71],
  2025: [336469.65, 454025.84, 519102.26, 490267.63, 627708.67, 458813.7, 450734.61, 426814.08, 419071.97, 434559.4, 421781.78, 438377.83],
}

/** Meta do mês (0 a 11): 50% do ano anterior + 40% de dois anos antes + 10% de três, +13%. Sem os três anos, 0. */
export function metaDeReceita(ano: number, mes: number) {
  const [a, b, c] = [1, 2, 3].map((n) => RECEITA_HISTORICA[ano - n]?.[mes])
  if (!a || !b || !c) return 0
  return Math.round((a * 0.5 + b * 0.4 + c * 0.1) * 1.13)
}

export const dinheiro = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(value)
const contagem = (id: string, label: string, detalhe: string, valor: number, tom: Tom, destino: Destino): Indicador => ({ id, label, valor: String(valor).padStart(2, '0'), detalhe, tom, destino })
const valor = (id: string, label: string, detalhe: string, v: number, tom: Tom): Indicador => ({ id, label, valor: dinheiro(v), detalhe, tom, destino: RESERVAS })

const horaSaoPaulo = (date: Date) => Number(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' }).format(date))

/** Operação: reservas de hoje (D0). Motorista próprio = vínculo 0 no funcionário. */
export function indicadoresOperacao(reservas: Row[]): Indicador[] {
  const proprioSemVeiculo = (row: Row) => Boolean(row._cr40f_motorista_value) && Number((row.cr40f_Motorista as Row | undefined)?.cr40f_tipodevinculo) === 0 && !row._cr40f_veiculo_value
  const porHora = new Map<number, number>()
  for (const row of reservas) {
    const saida = new Date(texto(row.cr40f_dataehorriodesada))
    if (Number.isNaN(saida.getTime())) continue
    const hora = horaSaoPaulo(saida)
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1)
  }
  const pico = [...porHora.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
  const dois = (n: number) => String(n).padStart(2, '0')
  return [
    contagem('services_today', 'Serviços hoje', 'reservas em D0', reservas.length, 'info', RESERVAS),
    contagem('without_driver', 'Sem motorista', 'reservas sem motorista', reservas.filter((r) => !r._cr40f_motorista_value).length, 'warning', RESERVAS),
    contagem('without_vehicle', 'Sem veículo', 'motoristas próprios sem veículo', reservas.filter(proprioSemVeiculo).length, 'warning', RESERVAS),
    { id: 'peak_hour', label: 'Horário de pico', valor: pico ? `${dois(pico[0])}h–${dois((pico[0] + 1) % 24)}h` : '--', detalhe: pico ? `${pico[1]} saídas no período` : 'nenhuma saída hoje', tom: 'info', destino: RESERVAS },
  ]
}

const diaMes = (value: string) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '--/--' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO }).format(d)
}
const horaMinuto = (value: string) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '--:--' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: FUSO }).format(d)
}

/** Financeiro: reservas de hoje, reservas de hoje e amanhã (a receber), passageiros e lançamentos do caixa. */
export function dadosFinanceiro(input: { reservas: Row[]; aReceber: Row[]; passageiros: Row[]; caixa: Row[] }, now: Date, inicioDoDia: Date): { indicadores: Indicador[]; aReceber: ServicoAReceber[] } {
  const hoje = inicioDoDia.toISOString().slice(0, 10)
  const pendentes = input.reservas.filter((r) => Number(r.cr40f_status) === 100000001 && Number(r.cr40f_statusdefaturamento) !== 100000001).length
  const recebimentosHoje = input.caixa.filter((r) => texto(r.cr40f_data).slice(0, 10) === hoje && Number(r.cr40f_valor) > 0).length
  const paxPorReserva = new Map<string, string[]>()
  for (const row of input.passageiros) {
    const reserva = normalizarId(row._cr40f_geral_value)
    const nome = lookupNome(row, 'cr40f_bancodedados')
    if (!reserva || !nome) continue
    const atual = paxPorReserva.get(reserva) ?? []
    if (!atual.includes(nome)) paxPorReserva.set(reserva, [...atual, nome])
  }
  const aReceber = input.aReceber.map((row) => {
    const id = texto(row.cr40f_reservadeveculosid)
    const saida = texto(row.cr40f_dataehorriodesada)
    return { id, titulo: tituloDe(row, 'Serviço sem identificação'), data: diaMes(saida), hora: horaMinuto(saida), saida, passageiro: paxPorReserva.get(normalizarId(id))?.join(', ') || 'Pax não informado', rota: texto(row.cr40f_trajeto || row.cr40f_destino) || 'Rota não informada' }
  }).sort((a, b) => a.saida.localeCompare(b.saida)).slice(0, 24)
  return {
    indicadores: [
      contagem('pending_composition', 'Qtd. serviços pendentes', 'de composição', pendentes, 'danger', RESERVAS),
      contagem('today_receivables', 'Recebimentos do dia', 'a receber', recebimentosHoje, 'info', FLUXO_CAIXA),
      contagem('business_days_to_close', 'Dias úteis até fechamento', 'restantes no mês', diasUteisAteFimDoMes(now), 'warning', FLUXO_CAIXA),
    ],
    aReceber,
  }
}

/** TI: operações assíncronas (falhas = statuscode 31, 32 ou 40), leads e campanhas ativos. */
export function indicadoresTi(input: { async: Row[]; leads: Row[]; campanhas: Row[] }): Indicador[] {
  const falha = (r: Row) => [31, 32, 40].includes(Number(r.statuscode))
  return [
    contagem('integration_failures', 'Falhas de integração', 'operações com erro', input.async.filter(falha).length, 'danger', { entidade: 'asyncoperation' }),
    contagem('it_tasks', 'Tarefas de TI', 'operações em andamento', input.async.filter((r) => !falha(r)).length, 'info', { entidade: 'asyncoperation' }),
    contagem('new_leads', 'Leads novos', 'leads ativos', input.leads.length, 'success', { entidade: 'lead' }),
    contagem('active_campaigns', 'Campanhas ativas', 'campanhas abertas', input.campanhas.length, 'warning', { entidade: 'campaign' }),
  ]
}

/** Gestão: reservas do mês (categoria serviço) com o valor da composição de preço, e tarefas atrasadas da equipe. */
export function indicadoresGestao(input: { reservasDoMes: Row[]; precos: Row[]; tarefasAtrasadas: number }, now: Date): Indicador[] {
  const precos = new Map(input.precos.map((r) => [normalizarId(r.cr40f_composicaodeprecosid), { valor: Number(r.new_valortotal) || 0, concluida: Number(r.new_status) === 100000001 }]))
  const valorDe = (r: Row) => precos.get(normalizarId(r._new_composicaodepreco_value))?.valor || 0
  const status = (r: Row) => texto(r[`cr40f_status${FMT}`]).toLocaleLowerCase('pt-BR')
  const produzida = (r: Row) => Number(r.cr40f_status) === 202410008 || /conclu|realiz|finaliz/.test(status(r))
  const reservavel = (r: Row) => !/cancel|recus/.test(status(r))
  const soma = (rows: Row[]) => rows.reduce((t, r) => t + valorDe(r), 0)
  const mes = input.reservasDoMes
  const trabalhadas = mes.filter(produzida)
  const comTicket = trabalhadas.filter((r) => precos.get(normalizarId(r._new_composicaodepreco_value))?.concluida && valorDe(r) > 0)
  const ticket = comTicket.length ? soma(comTicket) / comTicket.length : 0
  const agendadas = mes.filter((r) => new Date(texto(r.cr40f_dataehorriodesada)) > now && reservavel(r) && !produzida(r))
  const receita = soma(trabalhadas)
  const meta = metaDeReceita(now.getFullYear(), now.getMonth())
  const metaPct = meta > 0 ? Math.round((receita / meta) * 100) : null
  const recebido = soma(mes.filter((r) => Number(r.cr40f_statusdefaturamento) === 202410010 && valorDe(r) > 0))
  const base = soma(mes.filter((r) => ![202410006, 202410008].includes(Number(r.cr40f_statusdefaturamento)) && valorDe(r) > 0))
  const recebidoPct = base > 0 ? Math.round((recebido / base) * 100) : 0
  return [
    valor('revenue_vs_goal', 'Receita', metaPct === null ? 'meta histórica indisponível' : `${metaPct}% da meta de ${dinheiro(meta)}`, receita, 'info'),
    valor('scheduled_revenue', 'Agendados', ticket > 0 ? `${agendadas.length} serviços × ticket médio ${dinheiro(ticket)}` : `${agendadas.length} serviços · ticket médio indisponível`, agendadas.length * ticket, 'warning'),
    valor('receipts_kpi', 'KPI Recebimento', `${recebidoPct}% da base de ${dinheiro(base)}`, recebido, 'success'),
    contagem('overdue_tasks', 'Qt. de tarefas atrasadas', 'toda a equipe', input.tarefasAtrasadas, 'danger', PLANNER),
  ]
}

/** Primeiro nome do apelido do funcionário (saudação). */
export const primeiroNome = (apelido: unknown) => texto(apelido).trim().split(/\s+/)[0] ?? ''
