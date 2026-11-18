import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { mockFalhaCarga } from '../../../app/mockVolume'
import type { Cliente } from '../domain/types'
import { latenciaMock } from '../../../app/latenciaMock'
import { guid } from '../../pagantes/data/queries'

export const ENTITY = 'cr40f_clientes1'
const SELECT = ['cr40f_clientes1id', 'cr40f_nomedocliente', 'cr40f_registro', 'cr40f_endereco', 'createdon']

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /** Clientes ativos (poucas dezenas: vem tudo de uma vez). */
  load: () => Promise<Cliente[]>
  /** Um cliente pelo ID (gaveta aberta por cima de outra lista); `null` se não existe ou está inativo. */
  get: (id: string) => Promise<Cliente | null>
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }

export function mapCliente(row: Row): Cliente {
  return { id: cleanId(str(row.cr40f_clientes1id)), nome: str(row.cr40f_nomedocliente), registro: str(row.cr40f_registro), endereco: str(row.cr40f_endereco), criadoEm: date(row.createdon) }
}

export const clientesPath = (set: string) =>
  `${set}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent('statecode eq 0')}&$orderby=${encodeURIComponent('cr40f_nomedocliente asc')}`

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

export const MOCK_CLIENTES: Cliente[] = [
  { id: '11111111-1111-4111-8111-111111111111', nome: 'Grupo Atlântico', registro: 'SJCampos', endereco: 'Av. Cassiano Ricardo, 601 - Jardim Aquarius, São José dos Campos - SP', criadoEm: new Date('2025-03-12T12:00:00Z') },
  { id: '22222222-2222-4222-8222-222222222222', nome: 'Lumen Consultoria', registro: 'Pinda', endereco: 'Rod. Presidente Dutra, km 99 - Pindamonhangaba - SP', criadoEm: new Date('2025-08-02T12:00:00Z') },
  { id: '33333333-3333-4333-8333-333333333333', nome: 'Particular', registro: 'SJCampos', endereco: '', criadoEm: new Date('2024-11-20T12:00:00Z') },
  { id: '44444444-4444-4444-8444-444444444444', nome: 'Tenaris', registro: 'Guará', endereco: 'Av. Juscelino Kubitschek, 2000 - Guaratinguetá - SP', criadoEm: new Date('2026-01-15T12:00:00Z') },
  // Clientes das últimas linhas do mock da Composição (MOCK_CLIENTE_IDS lá): o link de cliente abre esta ficha.
  { id: '55555555-5555-4555-8555-555555555555', nome: 'Pórtico Azul', registro: 'SJCampos', endereco: 'Av. Brigadeiro Faria Lima, 1500 - São Paulo - SP', criadoEm: new Date('2025-05-04T12:00:00Z') },
  { id: '66666666-6666-4666-8666-666666666666', nome: 'Campo Aberto Gestão', registro: 'Pinda', endereco: 'Rua Barão de Jaguara, 900 - Campinas - SP', criadoEm: new Date('2025-09-21T12:00:00Z') },
  { id: '77777777-7777-4777-8777-777777777777', nome: 'Lume Centro Empresarial', registro: 'Guará', endereco: '', criadoEm: new Date('2026-02-10T12:00:00Z') },
]

let seq = 0
function createMockSource(): Source {
  const rows = MOCK_CLIENTES.map((c) => ({ ...c }))
  return {
    mock: true,
    async load() { await wait(300); if (mockFalhaCarga()) throw new Error('Falha simulada na carga.'); return rows.map((c) => ({ ...c })) },
    async get(id) { await wait(200); const c = rows.find((x) => x.id === id); return c ? { ...c } : null },
    async create() { await wait(400); return `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, '0')}` },
    async update(id) { await wait(400); if (!rows.some((c) => c.id === id)) throw new Error('Cliente não encontrado.') },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let set: Promise<string> | null = null
  const entitySet = () => (set ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { set = null; throw error }))
  return {
    mock: false,
    load: async () => (await host.client.getAll(clientesPath(await entitySet()))).map(mapCliente),
    get: async (id) => {
      const [row] = await host.client.getAll(`${await entitySet()}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent(`statecode eq 0 and cr40f_clientes1id eq ${guid(id)}`)}`)
      return row ? mapCliente(row) : null
    },
    create: async (payload) => cleanId(await host.client.create(await entitySet(), payload)),
    update: async (id, payload) => host.client.update(await entitySet(), id, payload),
  }
}
