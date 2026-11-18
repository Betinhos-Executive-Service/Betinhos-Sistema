import { chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { FinanceiroServico, Recebimento } from './domain'

/** cr40f_anexorecebimento_v2, confirmado na metadata do DEV em 13/11/2026. */
export const ENTITY_SET = 'cr40f_anexorecebimento_v2s'
const MIDIA_VIDEO = 100000001
const SELECT = 'cr40f_anexorecebimento_v2id,cr40f_nome,cr40f_nomearquivo,cr40f_sharelink,cr40f_urlsharepoint,cr40f_dataenvio,cr40f_ordem,cr40f_tipomidia,cr40f_tipo,cr40f_status,_cr40f_reserva_value,_cr40f_enviadopor_value'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function mapRecebimento(row: Row): Recebimento {
  const nome = texto(row.cr40f_nomearquivo) || texto(row.cr40f_nome) || 'comprovante'
  const data = texto(row.cr40f_dataenvio)
  return {
    id: String(row.cr40f_anexorecebimento_v2id),
    nome,
    // Sem cr40f_driveitemid nesta tabela: a leitura vai sempre pelo link.
    url: texto(row.cr40f_sharelink) || texto(row.cr40f_urlsharepoint) || null,
    midia: row.cr40f_tipomidia === MIDIA_VIDEO ? 'video' : /\.pdf$/i.test(nome) ? 'pdf' : 'foto',
    reservaId: cleanId(String(row._cr40f_reserva_value ?? '')),
    ordem: typeof row.cr40f_ordem === 'number' ? row.cr40f_ordem : null,
    enviadoEm: data ? new Date(data) : null,
    motorista: formatted(row, '_cr40f_enviadopor_value'),
    tipo: formatted(row, 'cr40f_tipo'),
    status: typeof row.cr40f_status === 'number' ? row.cr40f_status : null,
    statusTexto: formatted(row, 'cr40f_status'),
  }
}

/** Ids válidos, sem repetição, em blocos de `tamanho`, com no máximo 4 consultas ao mesmo tempo (a lista do Geral com 500 serviços daria 34 de uma vez), como em pessoas/data/queries.ts. */
async function emOndas(client: DataverseClient, ids: string[], tamanho: number, url: (bloco: string[]) => string) {
  const rows: Row[] = []
  for (const onda of chunk(chunk([...new Set(ids.map(cleanId).filter((id) => GUID.test(id)))], tamanho), 4)) {
    rows.push(...(await Promise.all(onda.map((bloco) => client.getAll(url(bloco))))).flat())
  }
  return rows
}
const filtro = (ids: string[]) => encodeURIComponent(ids.map((id) => `_cr40f_reserva_value eq ${id}`).join(' or '))
/** Blocos de 15 reservas (limite de URL do OData). */
const consultar = (client: DataverseClient, reservaIds: string[], select: string) => emOndas(client, reservaIds, 15, (ids) => `${ENTITY_SET}?$select=${select}&$filter=${filtro(ids)}`)

/** Comprovantes dos serviços, com o nome do motorista pela anotação formatada do lookup. */
export async function loadRecebimentos(client: DataverseClient, reservaIds: string[]) {
  return (await consultar(client, reservaIds, SELECT)).map(mapRecebimento)
}

/** Quantos comprovantes cada serviço tem; serviço sem comprovante não entra no mapa. */
export async function contarPorReserva(client: DataverseClient, reservaIds: string[]) {
  const contagem = new Map<string, number>()
  for (const row of await consultar(client, reservaIds, '_cr40f_reserva_value')) {
    const id = cleanId(String(row._cr40f_reserva_value ?? ''))
    if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }
  return contagem
}

/** FetchXML agregado: comprovantes por OP, pelo serviço (`cr40f_reserva` → `cr40f_financeiro` da reserva). */
export function fetchContagemPorOp(opIds: string[]) {
  const valores = opIds.map((id) => `<value>${id}</value>`).join('')
  return '<fetch aggregate="true"><entity name="cr40f_anexorecebimento_v2">'
    + '<attribute name="cr40f_anexorecebimento_v2id" alias="qtd" aggregate="count"/>'
    + '<link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_reserva" alias="srv" link-type="inner">'
    + '<attribute name="cr40f_financeiro" alias="op_id" groupby="true"/>'
    + `<filter><condition attribute="cr40f_financeiro" operator="in">${valores}</condition></filter>`
    + '</link-entity></entity></fetch>'
}

/** Quantos comprovantes cada OP tem (soma dos serviços); OP sem comprovante não entra no mapa (o agregado só devolve grupos com anexo).
 * 50 ids em `<value>` cabem folgados na URL do FetchXML. */
export async function contarPorOp(client: DataverseClient, opIds: string[]) {
  const rows = await emOndas(client, opIds, 50, (ids) => `${ENTITY_SET}?fetchXml=${encodeURIComponent(fetchContagemPorOp(ids))}`)
  return new Map(rows.map((row) => [cleanId(String(row.op_id ?? '')), Number(row.qtd)]))
}

/** Valor e forma de pagamento do serviço (cr40f_reservadeveculos), confirmados na metadata do DEV em 16/11/2026. */
export async function loadFinanceiro(client: DataverseClient, reservaId: string): Promise<FinanceiroServico> {
  const row = await client.request<Row>(`cr40f_reservadeveculoses(${cleanId(reservaId)})?$select=cr40f_valor_a_receber,cr40f_receber,cr40f_formadepagamento`)
  return {
    valorAReceber: typeof row.cr40f_valor_a_receber === 'number' ? row.cr40f_valor_a_receber : null,
    receber: typeof row.cr40f_receber === 'boolean' ? row.cr40f_receber : null,
    formaPagamento: formatted(row, 'cr40f_formadepagamento'),
  }
}
