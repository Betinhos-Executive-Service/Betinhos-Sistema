import { chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import { andFilter, odataSearchFilter } from '../../../app/pagedLoad'
import type { Op } from '../domain/types'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Valor de cada OP pela composição de preços dos serviços, na mesma regra do detalhe (`loadServicos` + `totalOp`):
 * soma as composições ativas de cada serviço; a OP fica null se não tem serviço ou se algum serviço não tem composição.
 * Duas consultas por bloco de 15 OPs (reservas e composições, filtradas pela OP do serviço), 4 blocos por vez.
 */
export async function loadValoresServicos(client: DataverseClient, sets: { reserva: string; composicao: string }, opIds: string[]) {
  const ids = [...new Set(opIds.map((id) => cleanId(id)).filter((id) => GUID.test(id)))]
  const servicosPorOp = new Map<string, string[]>()
  const valorPorServico = new Map<string, number>()
  const bloco = async (part: string[]) => {
    const porOp = part.map((id) => `_cr40f_financeiro_value eq ${id}`).join(' or ')
    const porServico = part.map((id) => `cr40f_ServicoRelacionadoGeral/_cr40f_financeiro_value eq ${id}`).join(' or ')
    return Promise.all([
      client.getAll(`${sets.reserva}?$select=cr40f_reservadeveculosid,_cr40f_financeiro_value&$filter=${encodeURIComponent(porOp)}`),
      client.getAll(`${sets.composicao}?$select=new_valortotal,_cr40f_servicorelacionadogeral_value&$filter=${encodeURIComponent(`statecode eq 0 and (${porServico})`)}`),
    ])
  }
  // Blocos em ondas de 4: com centenas de OPs a soma não espera bloco por bloco, sem estourar o limite do Dataverse.
  const respostas: [Row[], Row[]][] = []
  for (const wave of chunk(chunk(ids, 15), 4)) respostas.push(...await Promise.all(wave.map(bloco)))
  for (const [reservas, composicoes] of respostas) {
    for (const r of reservas) {
      const op = cleanId(String(r._cr40f_financeiro_value ?? '')).toLowerCase()
      const servico = cleanId(String(r.cr40f_reservadeveculosid ?? '')).toLowerCase()
      if (op && servico) servicosPorOp.set(op, [...(servicosPorOp.get(op) ?? []), servico])
    }
    for (const c of composicoes) {
      const servico = cleanId(String(c._cr40f_servicorelacionadogeral_value ?? '')).toLowerCase()
      const valor = typeof c.new_valortotal === 'number' && Number.isFinite(c.new_valortotal) ? c.new_valortotal : 0
      if (servico) valorPorServico.set(servico, (valorPorServico.get(servico) ?? 0) + valor)
    }
  }
  const valores = new Map<string, number | null>()
  for (const id of ids) {
    const servicos = servicosPorOp.get(id.toLowerCase()) ?? []
    const completo = servicos.length > 0 && servicos.every((s) => valorPorServico.has(s))
    valores.set(id.toLowerCase(), completo ? Math.round(servicos.reduce((sum, s) => sum + valorPorServico.get(s)!, 0) * 100) / 100 : null)
  }
  return valores
}

export const ENTITY_OP = 'cr40f_financeiro'

const SELECT = [
  'cr40f_financeiroid', 'cr40f_idfinanceiro', 'cr40f_status', 'cr40f_valor', 'new_clientedaop', 'new_passageirosdaop', 'cr40f_trajetos',
  'cr40f_datado1servico', 'cr40f_datadoultimoservico', 'cr40f_idioma', 'createdon', 'modifiedon', '_createdby_value',
]

/** Busca no servidor: número da OP pelo começo; cliente e passageiros (textos montados por flow) em qualquer posição. */
export const opsSearchFilter = (query: string) => odataSearchFilter(query, { startsWith: ['cr40f_idfinanceiro'], contains: ['new_clientedaop', 'new_passageirosdaop'] })

export function opsPath(entitySet: string, since: Date | null, search: string | null = null) {
  const filter = andFilter(since ? `statecode eq 0 and createdon ge ${since.toISOString()}` : 'statecode eq 0', search)
  return `${entitySet}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('createdon desc')}`
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
/** Texto de flow: "null"/"undefined" literais contam como vazio. */
const text = (value: unknown) => { const s = str(value).trim(); return /^(null|undefined)$/i.test(s) ? '' : s }
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const date = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
/**
 * Coluna "Somente data" chega como "2026-07-27T00:00:00" (às vezes com hora gravada por flow, sem fuso).
 * Lida como data local: `new Date` a trataria como UTC e mostraria o dia anterior em São Paulo.
 */
export const dateOnly = (value: unknown) => {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null
}

export function mapOp(row: Row): Op {
  return {
    id: cleanId(str(row.cr40f_financeiroid)),
    codigo: text(row.cr40f_idfinanceiro),
    status: num(row.cr40f_status),
    valor: num(row.cr40f_valor),
    cliente: text(row.new_clientedaop),
    passageiros: text(row.new_passageirosdaop),
    trajetos: text(row.cr40f_trajetos),
    primeiroServico: dateOnly(row.cr40f_datado1servico),
    ultimoServico: dateOnly(row.cr40f_datadoultimoservico),
    idioma: num(row.cr40f_idioma),
    criadoEm: date(row.createdon),
    criadoPor: row._createdby_value ? formatted(row, '_createdby_value') : '',
    alteradoEm: date(row.modifiedon),
  }
}
