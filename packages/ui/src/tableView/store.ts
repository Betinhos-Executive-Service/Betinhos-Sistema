import { normalizeConfig, parseConfig, type ViewColumnDef, type ViewConfig } from './config'

/** Visão como o armazenamento a devolve; `config` é o texto gravado (JSON da §10.9.1 ou o formato próprio do store). */
export type StoredView = {
  id: string
  name: string
  /** Pública: visível para todos, só gestor altera. Pessoal: só do dono. */
  publica: boolean
  /** Pessoal do usuário atual (as pessoais de outros usuários nunca aparecem). */
  mine: boolean
  ordem?: number
  config: string
}

/**
 * Onde as visões ficam. A tela injeta a implementação: Dataverse (`cr40f_visaodetabela`), a da Geral
 * (`savedquery`/`userquery`) ou a de memória (modo navegador e testes). Erros sobem como exceção.
 */
export type ViewStore = {
  list: (tela: string) => Promise<StoredView[]>
  create: (tela: string, name: string, config: string) => Promise<StoredView>
  update: (id: string, patch: { name?: string; config?: string }) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Torna pública (só gestor). */
  publish: (id: string) => Promise<void>
  /** O usuário atual pode publicar e alterar visões públicas. */
  canPublish: () => Promise<boolean>
}

export type ViewScope = 'padrao' | 'publica' | 'pessoal'

/** Visão pronta para a tela: configuração já ajustada às colunas atuais e permissão resolvida. */
export type TableViewEntry = { id: string; name: string; scope: ViewScope; canEdit: boolean; config: ViewConfig }

export const DEFAULT_VIEW_ID = 'padrao'
export const DEFAULT_VIEW_NAME = 'Visão padrão'

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')

/** Padrão, depois públicas (por ordem e nome), depois as minhas (por nome); pessoais de outros ficam de fora. */
export function buildEntries(stored: StoredView[], defs: ViewColumnDef[], fallback: ViewConfig, canPublish: boolean): TableViewEntry[] {
  const entry = (v: StoredView, scope: ViewScope): TableViewEntry => ({
    id: v.id, name: v.name, scope, canEdit: scope === 'pessoal' || canPublish, config: normalizeConfig(parseConfig(v.config), defs, fallback),
  })
  const publicas = stored.filter((v) => v.publica).sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || byName(a, b))
  const minhas = stored.filter((v) => !v.publica && v.mine).sort(byName)
  return [
    { id: DEFAULT_VIEW_ID, name: DEFAULT_VIEW_NAME, scope: 'padrao', canEdit: false, config: fallback },
    ...publicas.map((v) => entry(v, 'publica')),
    ...minhas.map((v) => entry(v, 'pessoal')),
  ]
}

/** Visão inicial: a última usada, se ainda existir; senão a padrão. */
export const pickInitial = (entries: TableViewEntry[], lastId: string | null) => entries.find((e) => e.id === lastId) ?? entries[0]

/** Store em memória para o modo navegador e testes. */
export function createMemoryViewStore(seed: StoredView[] = [], options: { canPublish?: boolean } = {}): ViewStore & { snapshot: () => StoredView[] } {
  let views = seed.map((v) => ({ ...v, tela: '' as string }))
  let next = 1
  const find = (id: string) => {
    const view = views.find((v) => v.id === id)
    if (!view) throw new Error('Visão não encontrada.')
    return view
  }
  const strip = ({ tela: _tela, ...view }: StoredView & { tela: string }): StoredView => view
  return {
    list: async (tela) => views.filter((v) => v.tela === '' || v.tela === tela).map(strip),
    async create(tela, name, config) {
      const view = { id: `mem-${next++}`, name, publica: false, mine: true, config, tela }
      views = [...views, view]
      return strip(view)
    },
    async update(id, patch) {
      find(id)
      views = views.map((v) => (v.id === id ? { ...v, ...patch } : v))
    },
    async remove(id) {
      find(id)
      views = views.filter((v) => v.id !== id)
    },
    async publish(id) {
      if (!options.canPublish) throw new Error('Só gestores publicam visões.')
      find(id)
      views = views.map((v) => (v.id === id ? { ...v, publica: true, mine: false } : v))
    },
    canPublish: async () => Boolean(options.canPublish),
    snapshot: () => views.map(strip),
  }
}
