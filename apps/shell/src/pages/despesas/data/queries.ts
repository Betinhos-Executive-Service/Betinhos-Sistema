import { cleanId, formatted, type Row } from '@betinhos/dataverse'
import { safeUrl } from '../../pagantes/domain/messages'
import type { AnaliseIA } from '../domain/ia'
import type { Anexo, Despesa } from '../domain/types'

export const ENTITY_DESPESA = 'cr40f_despesaoperacional'
export const ENTITY_ANEXO = 'cr40f_anexodespesaoperacional'

/** Tabelas dos vínculos, para o link "Abrir" no model-driven. */
export const LINKED = { motorista: 'cr40f_funcionarios', veiculo: 'cr40f_veiculos', reserva: 'cr40f_reservadeveculos', manutencao: 'cr40f_manutencoes' } as const

const LOOKUPS = ['categoria', 'formapagamento', 'motorista', 'veiculo', 'reserva', 'manutencao', 'cidade'].map((n) => `_cr40f_${n}_value`)

const SELECT = [
  'cr40f_despesaoperacionalid', 'cr40f_nome', 'cr40f_datagasto', 'cr40f_valor', 'cr40f_estabelecimento',
  'cr40f_statusoperacional', 'cr40f_statusfinanceiro', 'cr40f_statusanexo', 'cr40f_origem',
  'cr40f_kminformado', 'cr40f_litros', 'cr40f_observacao', 'cr40f_observacaointerna', 'cr40f_protocolo', 'cr40f_possivelduplicidade',
  'cr40f_latitude', 'cr40f_longitude',
  'cr40f_iastatusanalise', 'cr40f_iadecisao', 'cr40f_iamotivos', 'cr40f_iavalorlido', 'cr40f_iadatalida', 'cr40f_iacnpjlido',
  'cr40f_iaestabelecimentolido', 'cr40f_iaconfianca', 'cr40f_iamodelo', 'cr40f_iadataanalise', 'createdon', 'modifiedon', '_createdby_value', '_modifiedby_value', ...LOOKUPS,
]

/** Despesas ativas com data do gasto a partir de `since` (null = todas), mais recentes primeiro. */
export function despesasPath(entitySet: string, since: Date | null) {
  const filter = since ? `statecode eq 0 and cr40f_datagasto ge ${since.toISOString()}` : 'statecode eq 0'
  return `${entitySet}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('cr40f_datagasto desc')}`
}

const ANEXO_SELECT = ['cr40f_anexodespesaoperacionalid', 'cr40f_nome', 'cr40f_nomearquivo', 'cr40f_tipo', 'cr40f_status', 'cr40f_sharelink', 'cr40f_urlsharepoint', 'cr40f_dataenvio', 'cr40f_driveitemid', 'createdon', '_cr40f_enviadopor_value']

export function anexosPath(entitySet: string, despesaId: string) {
  const filter = `statecode eq 0 and _cr40f_despesa_value eq ${cleanId(despesaId)}`
  return `${entitySet}?$select=${ANEXO_SELECT.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('cr40f_ordem asc,createdon asc')}`
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const date = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
const lookup = (row: Row, name: string) => {
  const field = `_cr40f_${name}_value`
  const id = str(row[field])
  return { id: id ? cleanId(id) : '', nome: id ? formatted(row, field) : '' }
}
const user = (row: Row, field: string) => (row[field] ? formatted(row, field) : '')

const mapIA = (row: Row): AnaliseIA => ({
  status: num(row.cr40f_iastatusanalise),
  decisao: num(row.cr40f_iadecisao),
  motivos: str(row.cr40f_iamotivos).split(/\r?\n/).map((m) => m.trim()).filter(Boolean),
  valorLido: num(row.cr40f_iavalorlido),
  dataLida: str(row.cr40f_iadatalida).slice(0, 10),
  cnpjLido: str(row.cr40f_iacnpjlido),
  estabelecimentoLido: str(row.cr40f_iaestabelecimentolido),
  confianca: num(row.cr40f_iaconfianca),
  modelo: str(row.cr40f_iamodelo),
  analisadaEm: date(row.cr40f_iadataanalise),
})

export function mapDespesa(row: Row): Despesa {
  const categoria = lookup(row, 'categoria')
  const forma = lookup(row, 'formapagamento')
  const motorista = lookup(row, 'motorista')
  const veiculo = lookup(row, 'veiculo')
  const reserva = lookup(row, 'reserva')
  const manutencao = lookup(row, 'manutencao')
  return {
    id: cleanId(str(row.cr40f_despesaoperacionalid)),
    nome: str(row.cr40f_nome),
    data: date(row.cr40f_datagasto),
    valor: num(row.cr40f_valor),
    estabelecimento: str(row.cr40f_estabelecimento),
    categoriaId: categoria.id, categoria: categoria.nome,
    formaId: forma.id, forma: forma.nome,
    motoristaId: motorista.id, motorista: motorista.nome,
    veiculoId: veiculo.id, veiculo: veiculo.nome,
    reservaId: reserva.id, reserva: reserva.nome,
    manutencaoId: manutencao.id, manutencao: manutencao.nome,
    cidade: lookup(row, 'cidade').nome,
    statusOperacional: num(row.cr40f_statusoperacional),
    statusFinanceiro: num(row.cr40f_statusfinanceiro),
    statusAnexo: num(row.cr40f_statusanexo),
    origem: num(row.cr40f_origem),
    km: num(row.cr40f_kminformado),
    litros: num(row.cr40f_litros),
    observacao: str(row.cr40f_observacao),
    observacaoInterna: str(row.cr40f_observacaointerna),
    protocolo: str(row.cr40f_protocolo),
    possivelDuplicidade: row.cr40f_possivelduplicidade === true,
    latitude: num(row.cr40f_latitude),
    longitude: num(row.cr40f_longitude),
    criadoEm: date(row.createdon),
    criadoPor: user(row, '_createdby_value'),
    alteradoEm: date(row.modifiedon),
    alteradoPor: user(row, '_modifiedby_value'),
    ia: mapIA(row),
  }
}

/** Link de compartilhamento primeiro; o caminho do SharePoint é o reserva. Só http(s) vira link. */
export function mapAnexo(row: Row): Anexo {
  const url = safeUrl(str(row.cr40f_sharelink)) ?? safeUrl(str(row.cr40f_urlsharepoint))
  return {
    id: cleanId(str(row.cr40f_anexodespesaoperacionalid)),
    nome: str(row.cr40f_nomearquivo) || str(row.cr40f_nome) || 'Arquivo sem nome',
    tipo: num(row.cr40f_tipo),
    status: num(row.cr40f_status),
    url,
    driveItemId: str(row.cr40f_driveitemid),
    enviadoEm: date(row.cr40f_dataenvio) ?? date(row.createdon),
    enviadoPor: row._cr40f_enviadopor_value ? formatted(row, '_cr40f_enviadopor_value') : '',
  }
}
