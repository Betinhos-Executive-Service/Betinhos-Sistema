import { cleanId, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Host } from '../../host'

/** Uma linha de new_appmotoristaslog, gravada pelo logger compartilhado do Design System (todos os apps). */
export type LogApp = {
  id: string
  data: Date | null
  app: string
  versao: string
  severidade: string
  tela: string
  usuario: string
  email: string
  mensagem: string
  erro: string
  codigo: string
  origem: string
  acao: string
  fase: string
  componente: string
  stack: string
  payload: string
  url: string
  plataforma: string
  sessao: string
  offline: boolean | null
}

export const ENTITY = 'new_appmotoristaslog'
/** Teto da carga: a tabela cresce sem limpeza e a tela é para investigar o recente. */
export const MAX_LOGS = 5000

const SELECT = [
  'new_appmotoristaslogid', 'createdon', 'new_appname', 'new_appversion', 'new_severity', 'new_screen', 'new_username', 'new_useremail',
  'new_message', 'new_errorname', 'new_errorcode', 'new_source', 'new_action', 'new_phase', 'new_component', 'new_stack', 'new_payloadjson',
  'new_url', 'new_platform', 'new_sessionid', 'new_isoffline',
]

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }

export const logsPath = (set: string, since: Date) =>
  `${set}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent(`createdon ge ${since.toISOString()}`)}&$orderby=${encodeURIComponent('createdon desc')}&$top=${MAX_LOGS}`

export function mapLog(row: Row): LogApp {
  return {
    id: cleanId(text(row.new_appmotoristaslogid)), data: date(row.createdon),
    app: text(row.new_appname), versao: text(row.new_appversion), severidade: text(row.new_severity).toLowerCase(), tela: text(row.new_screen),
    usuario: text(row.new_username), email: text(row.new_useremail), mensagem: text(row.new_message), erro: text(row.new_errorname), codigo: text(row.new_errorcode),
    origem: text(row.new_source), acao: text(row.new_action), fase: text(row.new_phase), componente: text(row.new_component),
    stack: text(row.new_stack), payload: text(row.new_payloadjson), url: text(row.new_url), plataforma: text(row.new_platform), sessao: text(row.new_sessionid),
    offline: typeof row.new_isoffline === 'boolean' ? row.new_isoffline : null,
  }
}

export async function loadLogs(client: DataverseClient, set: string, since: Date) {
  return (await client.getAll(logsPath(set, since))).map(mapLog)
}

/** Só leitura: Dataverse em produção, exemplos em memória no pnpm dev. */
export type Source = { mock: boolean; load: (since: Date) => Promise<LogApp[]> }

export function createSource(host: Host): Source {
  if (host.mode === 'mock') {
    return { mock: true, load: async (since) => { await new Promise((r) => setTimeout(r, 300)); return createMockLogs(new Date()).filter((l) => !l.data || l.data >= since) } }
  }
  let set: Promise<string> | null = null
  const entitySet = () => (set ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { set = null; throw error }))
  return { mock: false, load: async (since) => loadLogs(host.client, await entitySet(), since) }
}

const APPS = ['App Motoristas', 'Escala FDS', 'Sistema Betinhos']
const SEVERIDADES = ['error', 'warning', 'critical', 'info', 'error']
const TELAS = ['Serviços', 'Finalizar serviço', 'Checklist', 'Termos de multa', 'Escala']

export function createMockLogs(now: Date): LogApp[] {
  return Array.from({ length: 40 }, (_, i): LogApp => ({
    id: `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    data: new Date(now.getTime() - i * 5.5 * 3600_000),
    app: APPS[i % APPS.length], versao: `v2.1.${700 + (i % 30)}`, severidade: SEVERIDADES[i % SEVERIDADES.length], tela: TELAS[i % TELAS.length],
    usuario: i % 7 === 0 ? '' : `Motorista ${(i % 9) + 1}`, email: i % 7 === 0 ? '' : `motorista${(i % 9) + 1}@exemplo.com.br`,
    mensagem: i % 4 === 0 ? 'Failed to fetch' : `Falha ao salvar o registro ${i + 1}`, erro: i % 4 === 0 ? 'TypeError' : 'DataverseError', codigo: i % 3 === 0 ? '0x80040217' : '',
    origem: 'window.onerror', acao: 'salvar', fase: 'request', componente: 'FinalizeScreen',
    stack: i === 1 ? Array.from({ length: 80 }, (_, n) => `    at funcao${n} (app.js:${n + 10}:5)`).join('\n') : 'Error\n    at salvar (app.js:120:9)',
    payload: i === 2 ? '{"status": 500, "corte' : i % 2 ? JSON.stringify({ status: 500, path: 'cr40f_reservadeveculos', tentativa: i % 3 }) : '',
    url: 'https://org.crm2.dynamics.com/WebResources/new_app-motoristas-v2', plataforma: i % 2 ? 'Android' : 'iPhone', sessao: `sessao-${i % 5}`, offline: i % 6 === 0,
  }))
}
