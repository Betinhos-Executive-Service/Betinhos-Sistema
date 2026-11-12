import { cleanId, formatted, type Row } from '@betinhos/dataverse'
import { janelaCandidatas, MOTIVO_CASADA, motivoReprocessar, SITUACAO, STATUS_FORA, type CartaoForm } from '../domain/regras'
import type { Cartao, DespesaCandidata, Transacao } from '../domain/types'

export const ENTITIES = {
  cartao: 'cr40f_cartaocorporativo', transacao: 'cr40f_transacaocartao', despesa: 'cr40f_despesaoperacional',
  funcionario: 'cr40f_funcionarios', forma: 'cr40f_formapagamentodespesa',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Navegação dos lookups (SchemaName de provision-conciliacao-cartao.ps1). */
const NAV = { motorista: 'cr40f_Motorista', cartao: 'cr40f_Cartao', despesa: 'cr40f_Despesa' } as const
/** Mesmo nome que o provision do flow procura para `__FORMA_CARTAO__`. */
const FORMA_CARTAO = 'Cartão de crédito'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const lookup = (row: Row, campo: string) => {
  const k = `_cr40f_${campo}_value`
  return row[k] ? { id: cleanId(str(row[k])), nome: formatted(row, k) } : { id: '', nome: '' }
}
const dia = (v: unknown) => str(v).slice(0, 10) || null
const order = (c: string) => `&$orderby=${encodeURIComponent(c)}`
const filter = (f: string) => `&$filter=${encodeURIComponent(f)}`

const CARTAO_SELECT = ['cr40f_cartaocorporativoid', 'cr40f_name', 'cr40f_idconta', 'cr40f_final', 'cr40f_iniciovigencia', 'cr40f_fimvigencia', '_cr40f_motorista_value']
/** Só ativos, como o flow (`statecode eq 0`). */
export const cartoesPath = (set: string) => `${set}?$select=${CARTAO_SELECT.join(',')}${filter('statecode eq 0')}${order('cr40f_name asc')}`

export function mapCartao(row: Row): Cartao {
  const m = lookup(row, 'motorista')
  return {
    id: cleanId(str(row.cr40f_cartaocorporativoid)), nome: str(row.cr40f_name), conta: str(row.cr40f_idconta), final: str(row.cr40f_final),
    motoristaId: m.id, motoristaNome: m.nome, inicio: dia(row.cr40f_iniciovigencia), fim: dia(row.cr40f_fimvigencia),
  }
}

const TRANS_SELECT = [
  'cr40f_transacaocartaoid', 'cr40f_name', 'cr40f_idconta', 'cr40f_fatura', 'cr40f_datacompra', 'cr40f_valor', 'cr40f_estabelecimento', 'cr40f_final',
  'cr40f_parcela', 'cr40f_totalparcelas', 'cr40f_tipo', 'cr40f_situacao', 'cr40f_canal', 'cr40f_motivo', '_cr40f_cartao_value', '_cr40f_motorista_value', '_cr40f_despesa_value',
  'cr40f_placa', 'cr40f_combustivel', 'cr40f_litros', 'cr40f_precolitro', 'cr40f_hodometro', 'cr40f_kmrodado', 'cr40f_desconto', 'cr40f_cidadeposto', '_cr40f_veiculo_value',
]
/** Últimos 12 meses pela data da compra (o período da tela filtra dentro disso). */
export const transacoesPath = (set: string, desde: string) =>
  `${set}?$select=${TRANS_SELECT.join(',')}${filter(`statecode eq 0 and cr40f_datacompra ge ${desde}`)}${order('cr40f_datacompra desc')}`

export function mapTransacao(row: Row): Transacao {
  const c = lookup(row, 'cartao'); const m = lookup(row, 'motorista'); const d = lookup(row, 'despesa'); const v = lookup(row, 'veiculo')
  return {
    id: cleanId(str(row.cr40f_transacaocartaoid)), descricao: str(row.cr40f_name), conta: str(row.cr40f_idconta), fatura: str(row.cr40f_fatura),
    dataCompra: dia(row.cr40f_datacompra) ?? '', valor: num(row.cr40f_valor) ?? 0, estabelecimento: str(row.cr40f_estabelecimento), final: str(row.cr40f_final),
    parcela: num(row.cr40f_parcela), totalParcelas: num(row.cr40f_totalparcelas), tipo: num(row.cr40f_tipo), situacao: num(row.cr40f_situacao), canal: num(row.cr40f_canal), motivo: str(row.cr40f_motivo),
    cartaoId: c.id, cartaoNome: c.nome, motoristaId: m.id, motoristaNome: m.nome, despesaId: d.id, despesaNome: d.nome,
    placa: str(row.cr40f_placa), combustivel: str(row.cr40f_combustivel), litros: num(row.cr40f_litros), precoLitro: num(row.cr40f_precolitro),
    hodometro: num(row.cr40f_hodometro), kmRodado: num(row.cr40f_kmrodado), desconto: num(row.cr40f_desconto), cidadePosto: str(row.cr40f_cidadeposto), veiculoNome: v.nome,
  }
}

export const formaCartaoPath = (set: string) =>
  `${set}?$select=cr40f_formapagamentodespesaid${filter(`cr40f_nome eq '${FORMA_CARTAO}' and statecode eq 0`)}`

/** Mesmo $filter da ação `Candidatas` do flow diário. */
export function candidatasPath(set: string, t: Transacao, formaCartaoId: string) {
  const j = janelaCandidatas(t)
  const f = [
    'statecode eq 0', `_cr40f_motorista_value eq ${cleanId(t.motoristaId)}`, `_cr40f_formapagamento_value eq ${cleanId(formaCartaoId)}`,
    `cr40f_valor ge ${j.valorMin.toFixed(2)}`, `cr40f_valor le ${j.valorMax.toFixed(2)}`, `cr40f_datagasto ge ${j.de}`, `cr40f_datagasto lt ${j.ate}`,
    ...STATUS_FORA.map((s) => `cr40f_statusoperacional ne ${s}`), '(cr40f_conciliadacartao eq false or cr40f_conciliadacartao eq null)',
  ].join(' and ')
  return `${set}?$select=cr40f_despesaoperacionalid,cr40f_nome,cr40f_protocolo,cr40f_datagasto,cr40f_valor,cr40f_estabelecimento${filter(f)}${order('cr40f_datagasto asc')}`
}

export function mapDespesa(row: Row): DespesaCandidata {
  const data = str(row.cr40f_datagasto)
  return {
    id: cleanId(str(row.cr40f_despesaoperacionalid)), nome: str(row.cr40f_nome), protocolo: str(row.cr40f_protocolo),
    data: data ? new Date(data) : null, valor: num(row.cr40f_valor), estabelecimento: str(row.cr40f_estabelecimento),
  }
}

const bind = (set: string, id: string) => `/${set}(${cleanId(id)})`

/** Casar à mão: despesa vinculada e situação Conciliada manual. */
export const casarPayload = (s: EntitySets, despesaId: string): Row => ({
  cr40f_situacao: SITUACAO.manual, cr40f_motivo: MOTIVO_CASADA, [`${NAV.despesa}@odata.bind`]: bind(s.despesa, despesaId),
})

/** Reprocessar: cartão e motorista do cartão vigente; volta a Pendente; o flow 'Reprocessada' casa ou cria a despesa na hora (o passo Reabertas do diário é a rede de segurança). */
export const reprocessarPayload = (s: EntitySets, c: Cartao): Row => ({
  cr40f_situacao: SITUACAO.pendente, cr40f_motivo: motivoReprocessar(c),
  [`${NAV.cartao}@odata.bind`]: bind(s.cartao, c.id), [`${NAV.motorista}@odata.bind`]: bind(s.funcionario, c.motoristaId),
})

export function cartaoPayload(s: EntitySets, f: CartaoForm): Row {
  return {
    cr40f_name: f.nome.trim(), cr40f_idconta: f.conta.trim(), cr40f_final: f.final || null,
    cr40f_iniciovigencia: f.inicio, cr40f_fimvigencia: f.fim || null, [`${NAV.motorista}@odata.bind`]: bind(s.funcionario, f.motoristaId ?? ''),
  }
}
