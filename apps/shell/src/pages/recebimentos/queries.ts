import { chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Recebimento } from './domain'

/** Confirmado na metadata do DEV em 13/11/2026. */
export const ENTITY = 'cr40f_anexorecebimento_v2'
export const ENTITY_SET = 'cr40f_anexorecebimento_v2s'
const MIDIA_VIDEO = 100000001
const SELECT = 'cr40f_anexorecebimento_v2id,cr40f_nome,cr40f_nomearquivo,cr40f_sharelink,cr40f_urlsharepoint,cr40f_dataenvio,cr40f_ordem,cr40f_tipomidia,_cr40f_reserva_value,_cr40f_enviadopor_value'
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
  }
}

/** Ids válidos, sem repetição, em blocos de 15 (limite de URL do OData). */
const blocos = (ids: string[]) => chunk([...new Set(ids.map(cleanId).filter((id) => GUID.test(id)))], 15)
const filtro = (ids: string[]) => encodeURIComponent(ids.map((id) => `_cr40f_reserva_value eq ${id}`).join(' or '))

/** Comprovantes dos serviços, com o nome do motorista pela anotação formatada do lookup. */
export async function loadRecebimentos(client: DataverseClient, reservaIds: string[]) {
  const respostas = await Promise.all(blocos(reservaIds).map((ids) => client.getAll(`${ENTITY_SET}?$select=${SELECT}&$filter=${filtro(ids)}&$orderby=cr40f_ordem asc`)))
  return respostas.flat().map(mapRecebimento)
}

/** Quantos comprovantes cada serviço tem; serviço sem comprovante não entra no mapa. */
export async function contarPorReserva(client: DataverseClient, reservaIds: string[]) {
  const respostas = await Promise.all(blocos(reservaIds).map((ids) => client.getAll(`${ENTITY_SET}?$select=_cr40f_reserva_value&$filter=${filtro(ids)}`)))
  const contagem = new Map<string, number>()
  for (const row of respostas.flat()) {
    const id = cleanId(String(row._cr40f_reserva_value ?? ''))
    if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }
  return contagem
}
