import { formatted, type Row } from '@betinhos/dataverse'
import { CP_CONCLUIDA, CP_PENDENTE, SEM_CLIENTE, SEM_MOTORISTA, VEICULO_PROPRIO, VEICULO_TERCEIRO } from '../domain/codes'
import { normL } from '../domain/format'
import { DIA_MS, dayKey, inicioMs } from '../domain/periodo'
import type {
  CategoriaDespesa, CategoriaVeiculo, Despesa, EventoConducao, FormaPagamento, Funcionario, Manutencao, Multa, Ocorrencia, Pagante, Reserva, TelemetriaDia, Veiculo, Viagem,
} from '../domain/types'

export const ENTITIES = {
  reserva: 'cr40f_reservadeveculos', composicao: 'cr40f_composicaodeprecos', manutencao: 'cr40f_manutencoes', multa: 'cr40f_multas',
  ocorrencia: 'cr40f_errooperacional', funcionario: 'cr40f_funcionarios', veiculo: 'cr40f_veiculos',
  telemetria: 'new_telemetriadiariainfleet', evento: 'new_eventoinfleet', viagem: 'new_viageminfleet',
  pagante: 'cr40f_pagantes', despesa: 'cr40f_despesaoperacional', categoriaDespesa: 'cr40f_categoriadespesaoperacional',
  formaPagamentoDespesa: 'cr40f_formapagamentodespesa', anexoDespesa: 'cr40f_anexodespesaoperacional',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const lower = (v: unknown) => str(v).toLowerCase()
/** `numberValue` do legado: número finito ou 0 (null, vazio e texto viram 0). */
const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const asRow = (v: unknown) => (v && typeof v === 'object' ? (v as Row) : null)
/** Só o rótulo formatado (sem cair no valor cru): para lookups, cujo valor cru é o GUID. */
const rotulo = (row: Row, field: string) => str(row[`${field}@OData.Community.Display.V1.FormattedValue`])

const RESERVA_SELECT = [
  'cr40f_reservadeveculosid', 'cr40f_dataehorriodesada', 'createdon', 'cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_tipodoservico',
  'cr40f_tipodeveiculo', '_cr40f_veiculo_value', 'new_categoriadoitem', '_new_composicaodepreco_value', '_cr40f_financeiro_value', 'new_datadefinalizacao',
]
const RESERVA_EXPAND = 'cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)'

/** Reservas com saída de `desde` 00:00 até o fim de `ate` em Brasília, na ordem do legado. */
export function reservasPath(set: string, desde: string, ate: string) {
  const filtro = `cr40f_dataehorriodesada ge ${new Date(inicioMs(desde)).toISOString()} and cr40f_dataehorriodesada lt ${new Date(inicioMs(ate) + DIA_MS).toISOString()}`
  return `${set}?$select=${RESERVA_SELECT.join(',')}&$expand=${RESERVA_EXPAND}&$filter=${encodeURIComponent(filtro)}&$orderby=${encodeURIComponent('cr40f_dataehorriodesada desc')}`
}
/** Janela [desde, ate] em Brasília, fim inclusivo, para colunas DateTime (mesma das reservas). */
const janelaDataHora = (campo: string, desde: string, ate: string) =>
  encodeURIComponent(`${campo} ge ${new Date(inicioMs(desde)).toISOString()} and ${campo} lt ${new Date(inicioMs(ate) + DIA_MS).toISOString()}`)

export const composicoesPath = (set: string) => `${set}?$select=cr40f_composicaodeprecosid,new_valortotal,new_status`
/** Manutenções com data na janela (`cr40f_datamanutencao` é DateTime na metadata DEV). */
export const manutencoesPath = (set: string, desde: string, ate: string) =>
  `${set}?$select=cr40f_datamanutencao,cr40f_valor,cr40f_datadaaprovacao,cr40f_status,cr40f_tipodoreparo,_cr40f_placa_carro_value,createdon&$filter=${janelaDataHora('cr40f_datamanutencao', desde, ate)}`
const MULTA_SELECT = 'cr40f_multasid,cr40f_dataehorario,cr40f_status,_cr40f_codigodainfracao_value,_cr40f_motorista_value,_cr40f_placa_value'
/**
 * Multas na janela (`cr40f_dataehorario` é DateTime) com a infração pelo `$expand` (legado L11531);
 * `comInfracao = false` é a consulta reduzida usada se a navegação falhar.
 */
export const multasPath = (set: string, desde: string, ate: string, comInfracao = true) =>
  `${set}?$select=${MULTA_SELECT}${comInfracao ? '&$expand=cr40f_Codigodainfracao($select=cr40f_codigodainfracao,cr40f_descricaodainfracao)' : ''}&$filter=${janelaDataHora('cr40f_dataehorario', desde, ate)}`
/** Ocorrências na janela (`cr40f_dataocorrencia` é DateTime). */
export const ocorrenciasPath = (set: string, desde: string, ate: string) => `${set}?$select=cr40f_dataocorrencia&$filter=${janelaDataHora('cr40f_dataocorrencia', desde, ate)}`
export const funcionariosPath = (set: string) =>
  `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_status,cr40f_validadedacnh,cr40f_funcao,new_apelido,cr40f_nomedaempresa`
export const veiculosPath = (set: string) =>
  `${set}?$select=cr40f_veiculosid,cr40f_statusdoveiculo,new_categoriadoveiculo,cr40f_placa,cr40f_marca,cr40f_modelo,cr40f_blindado,cr40f_anodefabricacao`

/** Telemetria diária do Infleet: `new_data` é DateOnly, então o filtro usa a data pura, sem hora. */
export const telemetriaPath = (set: string, desde: string, ate: string) =>
  `${set}?$select=new_data,_new_veiculo_value,new_tempomotorociosomin,new_distanciapercorridakm,new_velocidademedia,new_velocidademaxima,new_excessosdevelocidade,new_autonomiakml,new_tempoacimavelocidademin&$filter=${encodeURIComponent(`new_data ge ${desde} and new_data le ${ate}`)}`
export const viagensPath = (set: string, desde: string, ate: string) =>
  `${set}?$select=new_iniciadoem,_new_veiculo_value,_new_motorista_value,new_distanciakm,new_velocidademedia,new_velocidademaxima,new_combustivelconsumidolitros,new_custocombustivelconsumido&$filter=${janelaDataHora('new_iniciadoem', desde, ate)}`
export const eventosPath = (set: string, desde: string, ate: string) =>
  `${set}?$select=new_reportadoem,_new_motorista_value,new_slug,_new_veiculo_value,new_descricao,new_velocidaderegistrada,new_limitedevelocidade&$filter=${janelaDataHora('new_reportadoem', desde, ate)}`

const PAGANTE_SELECT = 'cr40f_pagantesid,createdon,_cr40f_financeiro_value,cr40f_status,cr40f_valor,cr40f_formadepagamento,_cr40f_bancodedados_value'
/**
 * Todos os pagantes, sem `$filter`: como o `loadPagantes` do legado, "Atrasados" e "CP mais antiga" dependem dos pendentes antigos.
 * `comPrimeiroPagamento = false` é a consulta sem `cr40f_datadoprimeiropagamento`.
 */
export const pagantesPath = (set: string, comPrimeiroPagamento = true) =>
  `${set}?$select=${PAGANTE_SELECT}${comPrimeiroPagamento ? ',cr40f_datadoprimeiropagamento' : ''}`
/** Despesas ativas com data do gasto na janela (`cr40f_datagasto` é DateTime). */
export const despesasPath = (set: string, desde: string, ate: string) =>
  `${set}?$select=cr40f_despesaoperacionalid,cr40f_nome,cr40f_datagasto,cr40f_valor,_cr40f_categoria_value,_cr40f_formapagamento_value,_cr40f_motorista_value,_cr40f_reserva_value,cr40f_statusfinanceiro,cr40f_statusanexo&$filter=${encodeURIComponent('statecode eq 0 and ')}${janelaDataHora('cr40f_datagasto', desde, ate)}&$orderby=${encodeURIComponent('cr40f_datagasto desc')}`
/** Cadastros de despesa: ativos, inteiros, na ordem do cadastro (legado L11610–11620). */
export const categoriasDespesaPath = (set: string) =>
  `${set}?$select=cr40f_categoriadespesaoperacionalid,cr40f_nome,cr40f_grupodre&$filter=${encodeURIComponent('statecode eq 0 and cr40f_ativa eq true')}&$orderby=${encodeURIComponent('cr40f_ordem asc')}`
export const formasPagamentoPath = (set: string) =>
  `${set}?$select=cr40f_formapagamentodespesaid,cr40f_nome&$filter=${encodeURIComponent('statecode eq 0 and cr40f_ativa eq true')}&$orderby=${encodeURIComponent('cr40f_ordem asc')}`
/** Só o vínculo: a despesa precisa saber quantos anexos tem (KPI "Sem comprovante"). */
export const anexosDespesaPath = (set: string) => `${set}?$select=_cr40f_despesa_value&$filter=${encodeURIComponent('statecode eq 0')}`

export type Cp = { valor: number; pendente: boolean; concluida: boolean }
export function mapCps(rows: Row[]) {
  const map = new Map<string, Cp>()
  for (const p of rows) {
    const id = lower(p.cr40f_composicaodeprecosid)
    if (!id) continue
    const status = num(p.new_status)
    map.set(id, { valor: Number(p.new_valortotal) || 0, pendente: status === CP_PENDENTE, concluida: status === CP_CONCLUIDA })
  }
  return map
}

/** `enrichReservas` do legado para uma linha do Dataverse. */
export function mapReserva(row: Row, cps: Map<string, Cp>): Reserva {
  const saidaRaw = str(row.cr40f_dataehorriodesada)
  const dia = dayKey(saidaRaw)
  const mot = asRow(row.cr40f_Motorista)
  const nome = str(mot?.cr40f_nomecompleto) || SEM_MOTORISTA
  const motorista = str(mot?.new_apelido) || nome
  const motoristaId = lower(mot?.cr40f_funcionariosid)
  const cpId = lower(row._new_composicaodepreco_value)
  const cp = cps.get(cpId)
  return {
    id: lower(row.cr40f_reservadeveculosid), saidaRaw, saidaMs: saidaRaw ? Date.parse(saidaRaw) : NaN, dia, mes: dia.slice(0, 7),
    criadoRaw: str(row.createdon),
    status: num(row.cr40f_status), statusLabel: formatted(row, 'cr40f_status') || 'Sem status',
    fatStatus: num(row.cr40f_statusdefaturamento), fatStatusLabel: formatted(row, 'cr40f_statusdefaturamento') || '—',
    categoriaItem: num(row.new_categoriadoitem), categoriaItemLabel: formatted(row, 'new_categoriadoitem'),
    tipoVeiculoRaw: row.cr40f_tipodeveiculo == null ? '' : String(row.cr40f_tipodeveiculo),
    tipoVeiculo: formatted(row, 'cr40f_tipodeveiculo') || '—',
    veiculoId: lower(row._cr40f_veiculo_value),
    // Sem id, a chave é o nome sem acento e sem caixa (`normL`), a mesma das despesas e do CSV 2026.
    motoristaId, motoristaKey: motoristaId || `nome:${normL(motorista)}`, motorista,
    cliente: str(asRow(row.cr40f_Cliente)?.cr40f_nomedocliente) || SEM_CLIENTE,
    cpId, cpCodigo: rotulo(row, '_new_composicaodepreco_value'), valor: cp?.valor ?? 0, cpPendente: cp?.pendente ?? false, cpConcluida: cp?.concluida ?? false,
    opId: lower(row._cr40f_financeiro_value), opCodigo: rotulo(row, '_cr40f_financeiro_value'),
    tipoServico: formatted(row, 'cr40f_tipodoservico') || '—', finalizadoRaw: str(row.new_datadefinalizacao),
  }
}

/** Instante de um datetime/date cru; NaN sem data (`daysBetweenValues` do legado devolve null nesses casos). */
const instante = (v: unknown) => { const s = str(v); return s ? Date.parse(s) : NaN }
export const mapManutencao = (row: Row): Manutencao => ({
  dia: dayKey(str(row.cr40f_datamanutencao)), valor: Number(row.cr40f_valor) || 0, aprovacaoDia: dayKey(str(row.cr40f_datadaaprovacao)),
  statusLabel: formatted(row, 'cr40f_status'), tipoReparo: formatted(row, 'cr40f_tipodoreparo') || '—', veiculoId: lower(row._cr40f_placa_carro_value),
  criadoDia: dayKey(str(row.createdon)), dataMs: instante(row.cr40f_datamanutencao), criadoMs: instante(row.createdon),
})

/** `funcMapGlobal` do legado por id: id do funcionário → apelido (ou nome completo). */
export function apelidosFuncionarios(funcionarios: Funcionario[]) {
  const map = new Map<string, string>()
  for (const f of funcionarios) if (f.id) map.set(f.id, f.apelido || f.nome)
  return map
}

/**
 * Multa como o legado (L16090 e L16098): motorista pelo apelido do funcionário (via id), senão o rótulo do lookup ('—');
 * infração pelo `$expand` (aparada), com o código caindo no rótulo do lookup quando a navegação não vem.
 */
export function mapMulta(row: Row, apelidos: ReadonlyMap<string, string> = new Map()): Multa {
  const motoristaId = lower(row._cr40f_motorista_value)
  const infracao = asRow(row.cr40f_Codigodainfracao)
  return {
    id: lower(row.cr40f_multasid), dia: dayKey(str(row.cr40f_dataehorario)), status: num(row.cr40f_status), statusLabel: formatted(row, 'cr40f_status'),
    motoristaId, motorista: apelidos.get(motoristaId) || rotulo(row, '_cr40f_motorista_value') || '—', veiculoId: lower(row._cr40f_placa_value),
    infracaoCodigo: (str(infracao?.cr40f_codigodainfracao) || formatted(row, '_cr40f_codigodainfracao_value')).trim(),
    infracaoDescricao: str(infracao?.cr40f_descricaodainfracao).trim(),
  }
}
export const mapOcorrencia = (row: Row): Ocorrencia => ({ dia: dayKey(str(row.cr40f_dataocorrencia)) })
export const mapFuncionario = (row: Row): Funcionario => {
  const cnh = str(row.cr40f_validadedacnh)
  return {
    id: lower(row.cr40f_funcionariosid), nome: str(row.cr40f_nomecompleto), apelido: str(row.new_apelido),
    statusLabel: formatted(row, 'cr40f_status'), cnhMs: cnh ? Date.parse(cnh) : NaN,
    funcao: formatted(row, 'cr40f_funcao') || '—', empresa: formatted(row, 'cr40f_nomedaempresa'),
  }
}
/** Ano de fabricação: número cru plausível ou o primeiro ano (19xx/20xx) do texto; o rótulo formatado de inteiro pode vir como "2.023". */
function anoFabricacao(row: Row) {
  const raw = row.cr40f_anodefabricacao
  if (typeof raw === 'number' && raw >= 1900 && raw <= 2100) return raw
  const m = /(19|20)\d{2}/.exec(raw == null ? '' : String(raw))
  return m ? Number(m[0]) : null
}
/** Código de Aluguel em `new_categoriadoveiculo` (metadata DEV, spec §7). */
const VEICULO_ALUGUEL = '100000002'
/**
 * Categoria pelo código ou pelo rótulo, como o legado (L14175–14180), mais Aluguel (código 100000002 ou rótulo com "aluguel"), que o legado não trata;
 * blindado como o legado (L15824: true, "true" ou 1).
 */
export function mapVeiculo(row: Row): Veiculo {
  const raw = row.new_categoriadoveiculo == null ? '' : String(row.new_categoriadoveiculo)
  const label = normL(formatted(row, 'new_categoriadoveiculo'))
  const categoria: CategoriaVeiculo = raw === VEICULO_PROPRIO || label.includes('proprio') ? 'Propria' : raw === VEICULO_TERCEIRO || label.includes('terceiro') ? 'Terceirizada'
    : raw === VEICULO_ALUGUEL || label.includes('aluguel') ? 'Aluguel' : ''
  const b = row.cr40f_blindado
  return {
    id: lower(row.cr40f_veiculosid), statusLabel: formatted(row, 'cr40f_statusdoveiculo'), categoria,
    placa: str(row.cr40f_placa), marca: formatted(row, 'cr40f_marca'), modelo: formatted(row, 'cr40f_modelo'),
    blindado: b === true || b === 'true' || b === 1, ano: anoFabricacao(row),
  }
}

/** `mes` é o texto bruto `slice(0, 7)`, sem fuso, como o `monthOf` do legado; `dia` é o dia em Brasília. */
export function mapViagem(row: Row): Viagem {
  const iniciado = str(row.new_iniciadoem)
  return {
    dia: dayKey(iniciado), mes: iniciado.slice(0, 7), veiculoId: lower(row._new_veiculo_value), motoristaId: lower(row._new_motorista_value), distancia: numero(row.new_distanciakm),
    velocidadeMedia: numero(row.new_velocidademedia), velocidadeMaxima: numero(row.new_velocidademaxima),
    combustivelL: numero(row.new_combustivelconsumidolitros), custoCombustivel: numero(row.new_custocombustivelconsumido),
  }
}
export function mapEvento(row: Row): EventoConducao {
  const reportado = str(row.new_reportadoem)
  return {
    dia: dayKey(reportado), mes: reportado.slice(0, 7), motoristaId: lower(row._new_motorista_value), tipo: str(row.new_slug),
    veiculoId: lower(row._new_veiculo_value), descricao: str(row.new_descricao), velocidade: numero(row.new_velocidaderegistrada), limite: numero(row.new_limitedevelocidade),
  }
}
export function mapTelemetria(row: Row): TelemetriaDia {
  const data = str(row.new_data)
  return {
    dia: dayKey(data), mes: data.slice(0, 7), veiculoId: lower(row._new_veiculo_value), ociosoMin: numero(row.new_tempomotorociosomin),
    distanciaKm: numero(row.new_distanciapercorridakm), velocidadeMedia: numero(row.new_velocidademedia), velocidadeMaxima: numero(row.new_velocidademaxima),
    excessos: numero(row.new_excessosdevelocidade), autonomia: numero(row.new_autonomiakml), tempoAcimaMin: numero(row.new_tempoacimavelocidademin),
  }
}

/** Pagante (`loadPagantes`, legado L11546); rótulos de forma e status com '—' vazio, como o `pgFv(...) || "—"` das distribuições. */
export function mapPagante(row: Row): Pagante {
  const criadoRaw = str(row.createdon)
  return {
    id: lower(row.cr40f_pagantesid), opId: lower(row._cr40f_financeiro_value),
    pessoaId: lower(row._cr40f_bancodedados_value), pessoa: rotulo(row, '_cr40f_bancodedados_value'), valor: Number(row.cr40f_valor) || 0,
    forma: num(row.cr40f_formadepagamento), formaLabel: formatted(row, 'cr40f_formadepagamento') || '—',
    status: num(row.cr40f_status), statusLabel: formatted(row, 'cr40f_status') || '—',
    criadoRaw, criadoDia: dayKey(criadoRaw), primeiroPagamentoRaw: str(row.cr40f_datadoprimeiropagamento),
  }
}

export const mapCategoriaDespesa = (row: Row): CategoriaDespesa => ({
  id: lower(row.cr40f_categoriadespesaoperacionalid), nome: str(row.cr40f_nome) || 'Sem categoria', grupoDre: str(row.cr40f_grupodre) || 'Sem grupo DRE',
})
export const mapFormaPagamento = (row: Row): FormaPagamento => ({ id: lower(row.cr40f_formapagamentodespesaid), nome: str(row.cr40f_nome) || 'Sem forma de pagamento' })

/** Quantidade de anexos por despesa (id em minúsculas). */
export function contarAnexos(rows: Row[]) {
  const map = new Map<string, number>()
  for (const row of rows) {
    const id = lower(row._cr40f_despesa_value)
    if (id) map.set(id, (map.get(id) ?? 0) + 1)
  }
  return map
}

/** `expenseCompanyLabel` do legado. */
function empresaDespesa(label: string) {
  const t = label.trim()
  const n = normL(t)
  if (n.includes('betinhos')) return 'BETINHOS'
  if (n.includes('depaula')) return 'DEPAULA'
  return t || 'Sem empresa'
}

export type ContextoDespesa = {
  categorias: ReadonlyMap<string, CategoriaDespesa>
  formas: ReadonlyMap<string, FormaPagamento>
  funcionarios: ReadonlyMap<string, Funcionario>
  anexos: ReadonlyMap<string, number>
}

/** `buildExpenseRows` do legado (L14535): categoria/forma pelos cadastros e depois pelo rótulo do lookup; motorista pelo nome completo do funcionário. */
export function mapDespesa(row: Row, ctx: ContextoDespesa): Despesa {
  const id = lower(row.cr40f_despesaoperacionalid)
  const categoriaId = lower(row._cr40f_categoria_value)
  const formaId = lower(row._cr40f_formapagamento_value)
  const motoristaId = lower(row._cr40f_motorista_value)
  const func = ctx.funcionarios.get(motoristaId)
  // `dateKey` do legado: texto bruto, sem fuso (filtro de período). O mês das séries é o `mK` do legado: mês em Brasília.
  const gasto = str(row.cr40f_datagasto)
  const dia = gasto.slice(0, 10)
  return {
    id, dia, mes: dayKey(gasto).slice(0, 7), valor: Number(row.cr40f_valor) || 0,
    categoriaId, categoria: ctx.categorias.get(categoriaId)?.nome || rotulo(row, '_cr40f_categoria_value') || 'Sem categoria',
    formaId, forma: ctx.formas.get(formaId)?.nome || rotulo(row, '_cr40f_formapagamento_value') || 'Sem forma de pagamento',
    empresa: func ? empresaDespesa(func.empresa) : 'Sem empresa',
    motoristaId, motorista: (func && (func.nome || func.apelido)) || rotulo(row, '_cr40f_motorista_value') || 'Sem motorista',
    reservaId: lower(row._cr40f_reserva_value),
    statusFinanceiro: num(row.cr40f_statusfinanceiro), statusAnexo: num(row.cr40f_statusanexo), anexos: ctx.anexos.get(id) ?? 0,
    descricao: str(row.cr40f_nome) || 'Despesa sem título',
  }
}
