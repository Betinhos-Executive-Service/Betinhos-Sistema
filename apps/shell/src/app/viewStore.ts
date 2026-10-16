import { createMemoryViewStore, type StoredView, type ViewStore } from '@betinhos/ui'
import type { DataverseClient } from '@betinhos/dataverse'
import type { Host } from '../host'

/**
 * Onde as listas guardam as visões salvas (DS §10.9.1): tabela `cr40f_visaodetabela` no Dataverse
 * (provisionada por `packages/deploy/provision-visoes.ps1`). Visão pública = dona é a equipe "Visões públicas";
 * só quem tem o papel "Gestor de visões" (ou é administrador) publica. No modo de exemplo, fica em memória.
 */

export const VIEW_ENTITY_SET = 'cr40f_visaodetabelas'
export const PUBLIC_TEAM = 'Visões públicas'
const PUBLISHER_ROLES = ['Gestor de visões', 'System Administrator', 'Administrador do Sistema']

type Row = {
  cr40f_visaodetabelaid: string
  cr40f_name: string | null
  cr40f_configuracao: string | null
  cr40f_ordem: number | null
  _ownerid_value: string | null
}

const odata = (text: string) => text.replace(/'/g, "''")

/** Store do Dataverse. `client` é o da Web API do shell; WhoAmI, equipe e papéis são lidos uma vez. */
export function createDataverseViewStore(client: DataverseClient): ViewStore {
  let me: Promise<string> | null = null
  const userId = () => (me ??= client.request<{ UserId: string }>('WhoAmI').then((r) => r.UserId.toLowerCase()).catch((e) => { me = null; throw e }))
  let team: Promise<string | null> | null = null
  const teamId = () => (team ??= client.request<{ value: { teamid: string }[] }>(`teams?$select=teamid&$filter=name eq '${odata(PUBLIC_TEAM)}' and teamtype eq 0`)
    .then((r) => r.value[0]?.teamid.toLowerCase() ?? null).catch((e) => { team = null; throw e }))

  return {
    async list(tela) {
      const [uid, tid, page] = await Promise.all([
        userId(),
        teamId(),
        client.request<{ value: Row[] }>(`${VIEW_ENTITY_SET}?$select=cr40f_visaodetabelaid,cr40f_name,cr40f_configuracao,cr40f_ordem,_ownerid_value&$filter=cr40f_tela eq '${odata(tela)}'&$orderby=cr40f_name asc`),
      ])
      return page.value.map((r): StoredView => {
        const owner = (r._ownerid_value ?? '').toLowerCase()
        return {
          id: r.cr40f_visaodetabelaid,
          name: r.cr40f_name ?? 'Sem nome',
          publica: tid != null && owner === tid,
          mine: owner === uid,
          ordem: r.cr40f_ordem ?? undefined,
          config: r.cr40f_configuracao ?? '',
        }
      })
    },
    async create(tela, name, config) {
      const id = await client.create(VIEW_ENTITY_SET, { cr40f_name: name, cr40f_tela: tela, cr40f_configuracao: config, cr40f_publica: false })
      return { id: id.replace(/[{}]/g, ''), name, publica: false, mine: true, config }
    },
    async update(id, patch) {
      await client.update(VIEW_ENTITY_SET, id, {
        ...(patch.name !== undefined ? { cr40f_name: patch.name } : {}),
        ...(patch.config !== undefined ? { cr40f_configuracao: patch.config } : {}),
      })
    },
    remove: (id) => client.remove(VIEW_ENTITY_SET, id),
    async publish(id) {
      const tid = await teamId()
      if (!tid) throw new Error(`A equipe "${PUBLIC_TEAM}" não existe neste ambiente.`)
      // Atribuir à equipe exige o privilégio Assign: o Dataverse recusa quem não é gestor.
      await client.update(VIEW_ENTITY_SET, id, { 'ownerid@odata.bind': `/teams(${tid})`, cr40f_publica: true })
    },
    async canPublish() {
      const uid = await userId()
      const roles = await client.request<{ value: { name: string }[] }>(`systemusers(${uid})/systemuserroles_association?$select=name`)
      return roles.value.some((r) => PUBLISHER_ROLES.includes(r.name))
    },
  }
}

/** Visões prontas do código (ex.: "Ativos"), mostradas como públicas e só leitura, antes das salvas no armazenamento. */
export function withBuiltinViews(store: ViewStore, builtins: (tela: string) => StoredView[]): ViewStore {
  const isBuiltin = (id: string) => id.startsWith('pronta:')
  const readOnly = () => Promise.reject(new Error('Visões prontas não podem ser alteradas. Use "Salvar como…".'))
  return {
    ...store,
    list: async (tela) => [...builtins(tela).map((v) => ({ ...v, id: `pronta:${v.id}`, publica: true, mine: false })), ...(await store.list(tela))],
    update: (id, patch) => (isBuiltin(id) ? readOnly() : store.update(id, patch)),
    remove: (id) => (isBuiltin(id) ? readOnly() : store.remove(id)),
    publish: (id) => (isBuiltin(id) ? readOnly() : store.publish(id)),
  }
}

// O modo de exemplo guarda as visões em memória, uma só vez por carga do app (sobrevive à troca de tela).
let mockStore: ViewStore | null = null

/** Store da tela: Dataverse no app publicado, memória no `pnpm dev`. */
export function viewStoreFor(host: Host): ViewStore {
  if (host.mode === 'mock') return (mockStore ??= createMemoryViewStore([], { canPublish: true }))
  return createDataverseViewStore(host.client)
}
